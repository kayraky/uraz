const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Ensure 'recordings' directory exists for local backups
const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Multer storage configuration for saving audio files locally
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, recordingsDir);
  },
  filename: (req, file, cb) => {
    // Format: YYYYMMDD_HHMMSS_SenderName.webm
    const senderName = req.body.senderName ? req.body.senderName.replace(/[^a-zA-Z0-9]/g, '_') : 'Anonim';
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `${timestamp}_${senderName}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Endpoint to receive voice note
app.post('/api/send-voice-note', upload.single('audio'), async (req, res) => {
  try {
    const senderName = req.body.senderName || 'İsimsiz Gönderici';
    const recipientEmail = process.env.RECIPIENT_EMAIL || 'urazaslanparlak@gmail.com';
    const audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({ success: false, error: 'Ses dosyası yüklenemedi.' });
    }

    console.log(`[Yeni Sesli Not] Gönderen: ${senderName}, Dosya: ${audioFile.filename}`);

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;

    let emailSent = false;
    let emailError = null;

    // Check if SMTP is configured
    if (smtpUser && smtpPass && smtpHost) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort) || 587,
        secure: parseInt(smtpPort) === 465, // true for 465, false for others
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const mailOptions = {
        from: `"Uraz Aslan Doğum Günü" <${smtpUser}>`,
        to: recipientEmail,
        subject: `🎂 Uraz Aslan İçin Yeni Doğum Günü Sesli Notu! (${senderName})`,
        text: `Merhaba,\n\nUraz Aslan için yeni bir doğum günü sesli notu bırakıldı!\n\nGönderen: ${senderName}\nTarih: ${new Date().toLocaleString('tr-TR')}\n\nSes kaydı bu e-postanın ekindedir. Oynatmak için eki açabilirsiniz.\n\nSevgiler,\nDoğum Günü Sesli Not Sistemi`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #3d342e; background-color: #fbf9f5; border-radius: 8px; border: 1px solid #e5dfd5; max-width: 600px; margin: auto;">
            <h2 style="color: #d4a373; border-bottom: 2px solid #e5dfd5; padding-bottom: 10px; margin-top: 0;">🎂 Yeni Doğum Günü Sesli Notu!</h2>
            <p>Merhaba,</p>
            <p>Kardeşin <strong>Uraz Aslan</strong> için web sitesi üzerinden yeni bir doğum günü tebriği sesli notu gönderildi!</p>
            <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; border-left: 4px solid #d4a373; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Gönderen:</strong> ${senderName}</p>
              <p style="margin: 0;"><strong>Tarih:</strong> ${new Date().toLocaleString('tr-TR')}</p>
            </div>
            <p>Gelen ses kaydını dinlemek için e-postanın ekinde yer alan ses dosyasını oynatabilirsiniz.</p>
            <hr style="border: 0; border-top: 1px solid #e5dfd5; margin: 20px 0;">
            <p style="font-size: 12px; color: #8e857c; text-align: center; margin: 0;">Bu e-posta Uraz Aslan'ın Doğum Günü Web Sitesi tarafından otomatik olarak gönderilmiştir.</p>
          </div>
        `,
        attachments: [
          {
            filename: `${senderName}_sesli_not${path.extname(audioFile.originalname) || '.webm'}`,
            path: audioFile.path
          }
        ]
      };

      try {
        await transporter.sendMail(mailOptions);
        emailSent = true;
        console.log(`[E-posta] E-posta başarıyla gönderildi: ${recipientEmail}`);
      } catch (err) {
        console.error('[E-posta Hatası]', err);
        emailError = err.message;
      }
    } else {
      console.log('[E-posta Pasif] SMTP bilgileri girilmemiş. Ses kaydı sadece sunucuda yerel olarak kaydedildi.');
    }

    return res.status(200).json({
      success: true,
      message: emailSent 
        ? 'Sesli notunuz başarıyla e-posta ile gönderildi!' 
        : 'Sesli notunuz sunucuya başarıyla kaydedildi! (E-posta SMTP ayarları yapılmadığı için yerel klasöre kaydedildi.)',
      filename: audioFile.filename,
      localBackup: true,
      emailSent: emailSent,
      emailError: emailError
    });

  } catch (error) {
    console.error('[Sunucu Hatası]', error);
    res.status(500).json({ success: false, error: 'Sunucuda bir hata oluştu.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🎉 Uraz Aslan Doğum Günü Sitesi Çalışıyor!`);
  console.log(`🌐 Adres: http://localhost:${PORT}`);
  console.log(`💾 Ses Kayıtları Klasörü: ${recordingsDir}`);
  console.log(`==================================================`);
});
