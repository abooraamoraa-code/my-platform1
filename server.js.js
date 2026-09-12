/**
 * ============================================================================
 * منصة الألعاب الفيزيائية الذكية - السيرفر الإنتاجي المركزي
 * إدارة وتطوير: أبو العز العمري
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 150, 
    message: { error: 'تم تجاوز الحد الأقصى من الطلبات المسموحة، يرجى المحاولة لاحقاً.' }
});

app.use(cors());
app.use(express.json());
app.use('/api/', apiLimiter);
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./games_production_master.db', (err) => {
    if (err) console.error('خطأ قاتل في ربط قاعدة البيانات:', err.message);
    else console.log('تم الاتصال بقاعدة البيانات الإنتاجية بنجاح تام.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        cat TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        physics_engine TEXT DEFAULT 'Box2D.js',
        fps_rating INTEGER DEFAULT 60,
        gravity_scale REAL DEFAULT 9.8,
        downloads_count INTEGER DEFAULT 0,
        developer_tag TEXT DEFAULT 'Community Dev',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`, async () => {
        db.get(`SELECT * FROM settings WHERE key = 'admin_pass_hash'`, async (err, row) => {
            if (!row) {
                const defaultPlainPass = 'Abueliz@2026#SecurePlatform!Master';
                const hashedPassword = await bcrypt.hash(defaultPlainPass, 12);
                db.run(`INSERT INTO settings (key, value) VALUES ('admin_pass_hash', ?)`, [hashedPassword], () => {
                    console.log('تم توليد التشفير الأمني المعقد لكلمة السر الإدارية بنجاح.');
                });
            }
        });
    });

    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT,
        description TEXT,
        ip_address TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

app.get('/api/games', (req, res) => {
    const { status, cat, physics } = req.query;
    let query = "SELECT * FROM games WHERE 1=1";
    let params = [];

    if (status) {
        query += " AND status = ?";
        params.push(status);
    }
    if (cat && cat !== 'الكل') {
        query += " AND cat = ?";
        params.push(cat);
    }
    if (physics) {
        query += " AND physics_engine = ?";
        params.push(physics);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/games', (req, res) => {
    const { title, cat, url, physics_engine, gravity_scale } = req.body;
    if (!title || !cat || !url) {
        return res.status(400).json({ error: 'العنوان، التصنيف، والرابط حقول إلزامية.' });
    }

    const query = `INSERT INTO games (title, cat, url, physics_engine, gravity_scale, status) VALUES (?, ?, ?, ?, ?, 'pending')`;
    db.run(query, [title, cat, url, physics_engine || 'Box2D.js', gravity_scale || 9.8], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO audit_logs (action_type, description, ip_address) VALUES (?, ?, ?)`, 
            ['GAME_SUBMISSION', `تم إرسال لعبة جديدة: ${title}`, req.ip]);
        res.json({ message: 'تم استلام اللعبة ورفعها بنجاح وهي قيد المراجعة في طابور الخوارزميات.', id: this.lastID });
    });
});

app.post('/api/v1/external/submit', (req, res) => {
    const { apiKey, title, category, gameUrl, physicsEngine } = req.body;
    if (apiKey !== 'ABU_ELIZ_MASTER_EXTERNAL_API_KEY_2026') {
        return res.status(403).json({ error: 'مفتاح المطور الخارجي (API Key) غير صالح أو مرفوض أمنياً.' });
    }
    if (!title || !gameUrl) {
        return res.status(400).json({ error: 'بيانات اللعبة الخارجية غير مكتملة.' });
    }

    db.run(`INSERT INTO games (title, cat, url, physics_engine, status, developer_tag) VALUES (?, ?, ?, ?, 'approved', 'External Developer')`, 
        [title, category || 'Simulation', gameUrl, physicsEngine || 'Matter.js'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'تم ربط وقبول اللعبة بنجاح من خارج المنصة عبر الـ API الخارجي المباشر!', gameId: this.lastID });
    });
});

app.patch('/api/games/:id', (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    db.run(`UPDATE games SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'تم تحديث حالة اللعبة بنجاح في النظام.' });
    });
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    db.get(`SELECT value FROM settings WHERE key = 'admin_pass_hash'`, async (err, row) => {
        if (err || !row) return res.status(401).json({ success: false, message: 'خطأ في بيانات المشرف الأساسية.' });

        const isMatch = await bcrypt.compare(password, row.value);
        if (isMatch) {
            db.run(`INSERT INTO audit_logs (action_type, description, ip_address) VALUES (?, ?, ?)`, ['ADMIN_LOGIN', 'تسجيل دخول ناجح للوحة التحكم', req.ip]);
            res.json({ success: true, message: 'تم التحقق من بصمة التشفير وتسجيل دخول الإدارة بنجاح.' });
        } else {
            res.status(401).json({ success: false, message: 'كلمة السر غير صحيحة.' });
        }
    });
});

app.post('/api/admin/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const complexRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{12,}$/;
    if (!complexRegex.test(newPassword)) {
        return res.status(400).json({ error: 'كلمة السر لا تستوفي شروط التعقيد الصارمة (يجب ألا تقل عن 12 خانة وتحوي رموزاً وأرقاماً وحروفاً كبيرة وصغيرة).' });
    }

    db.get(`SELECT value FROM settings WHERE key = 'admin_pass_hash'`, async (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'خطأ في الاتصال بقاعدة بيانات النظام.' });

        const isMatch = await bcrypt.compare(currentPassword, row.value);
        if (!isMatch) {
            return res.status(400).json({ error: 'كلمة السر الحالية المدخلة غير صحيحة.' });
        }

        const hashedNew = await bcrypt.hash(newPassword, 12);
        db.run(`UPDATE settings SET value = ? WHERE key = 'admin_pass_hash'`, [hashedNew], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'تم تغيير وتشفير كلمة السر الجديدة بمعايير الأمان العالية بنجاح.' });
        });
    });
});

app.get('/api/admin/stats', (req, res) => {
    db.get(`SELECT COUNT(*) as total FROM games`, (err, totalRow) => {
        db.get(`SELECT COUNT(*) as pending FROM games WHERE status='pending'`, (err, pendingRow) => {
            db.get(`SELECT COUNT(*) as approved FROM games WHERE status='approved'`, (err, approvedRow) => {
                res.json({
                    totalGames: totalRow.total,
                    pendingGames: pendingRow.pending,
                    approvedGames: approvedRow.approved,
                    serverUptime: process.uptime(),
                    activeMemory: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
                    nodeVersion: process.version
                });
            });
        });
    });
});

app.get('/api/admin/logs', (req, res) => {
    db.all(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 20`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل بكامل طاقته على الرابط: http://localhost:${PORT}`);
});