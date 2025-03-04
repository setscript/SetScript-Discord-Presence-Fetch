const express = require('express');
const { Client, GatewayIntentBits, Events, Partials, ActivityType, Options, WebSocketStatus } = require('discord.js');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const slowDown = require('express-slow-down');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const port = 5550;

// Güvenlik middleware'leri - CSP ayarları ile
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS ayarları
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Express middleware'leri
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik dosyaları servis et
app.use(express.static('public'));
app.use('/img', express.static(path.join(__dirname, 'public', 'img')));

// HTML şablonlarını yükle
const homeTemplate = fs.readFileSync(path.join(__dirname, 'views', 'home.html'), 'utf8');
const cardTemplate = fs.readFileSync(path.join(__dirname, 'views', 'card.html'), 'utf8');

// API durumu için yardımcı fonksiyon
function formatUptime(uptime) {
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    const seconds = Math.floor(uptime % 60);
    
    let result = [];
    if (days > 0) result.push(`${days} gün`);
    if (hours > 0) result.push(`${hours} saat`);
    if (minutes > 0) result.push(`${minutes} dk`);
    if (seconds > 0 && !days && !hours) result.push(`${seconds} sn`);
    
    return result.join(' ') || '0 sn';
}

function getMemoryUsage() {
    const used = process.memoryUsage();
    return Math.round(used.heapUsed / 1024 / 1024 * 100) / 100;
}

// Ana sayfa route'u
app.get('/', (req, res) => {
    res.send(homeTemplate);
});

// API durumu endpoint'i
app.get('/api/status', (req, res) => {
    const guild = client.guilds.cache.get(config.serverid);
    const memory = getMemoryUsage();
    
    // Tüm sunucuların toplam üye sayısını hesapla
    const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    
    res.json({
        version: '1.0.0',
        status: guild ? 'active' : 'maintenance',
        uptime: formatUptime(process.uptime()),
        memory: {
            usage: memory,
            unit: 'MB'
        },
        discord: {
            status: client.ws.status === 0 ? 'connected' : 'disconnected',
            ping: Math.round(client.ws.ping),
            guild: guild ? 'connected' : 'disconnected',
            totalUsers: totalUsers
        }
    });
});

// DDoS koruması için rate limiter
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 dakika
    max: 50, // IP başına maksimum istek
    message: {
        error: 'Çok fazla istek gönderdiniz. Lütfen 5 dakika sonra tekrar deneyin.',
        retryAfter: '5 dakika'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // IP bazlı istek sayacı
    keyGenerator: (req) => {
        return req.ip;
    },
    // Anlık istek sayısı kontrolü
    handler: (req, res) => {
        res.status(429).json({
            error: 'Rate limit aşıldı. Lütfen daha sonra tekrar deneyin.',
            retryAfter: '5 dakika'
        });
    },
    skip: (req) => {
        // Whitelist için özel IP'ler buraya eklenebilir
        return false;
    }
});

// Yavaşlatma middleware'i
const speedLimiter = slowDown({
    windowMs: 5 * 60 * 1000, // 5 dakika
    delayAfter: 30, // 30 istekten sonra yavaşlatmaya başla
    delayMs: (hits) => hits * 100, // Her fazla istek için 100ms gecikme ekle
    maxDelayMs: 2000, // Maksimum 2 saniye gecikme
});

// Anlık istek kontrolü için memory store
const requestStore = new Map();

// Anlık istek kontrol middleware'i
const burstLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowMs = 1000; // 1 saniyelik pencere
    const maxBurst = 10; // 1 saniye içinde maksimum istek

    if (!requestStore.has(ip)) {
        requestStore.set(ip, []);
    }

    const requests = requestStore.get(ip);
    const recentRequests = requests.filter(time => now - time < windowMs);
    
    if (recentRequests.length >= maxBurst) {
        return res.status(429).json({
            error: 'Çok fazla anlık istek tespit edildi. Lütfen yavaşlayın.',
            retryAfter: '1 saniye'
        });
    }

    recentRequests.push(now);
    requestStore.set(ip, recentRequests);

    // Eski kayıtları temizle
    setInterval(() => {
        for (const [ip, times] of requestStore.entries()) {
            const validTimes = times.filter(time => now - time < windowMs);
            if (validTimes.length === 0) {
                requestStore.delete(ip);
            } else {
                requestStore.set(ip, validTimes);
            }
        }
    }, windowMs);

    next();
};

// Özel endpoint rate limiting
const cardLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 dakika
    max: 25, // IP başına maksimum istek
    message: {
        error: 'Card endpoint\'i için çok fazla istek gönderdiniz. Lütfen 5 dakika sonra tekrar deneyin.',
        retryAfter: '5 dakika'
    },
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Rate limit aşıldı. Lütfen daha sonra tekrar deneyin.',
            retryAfter: '5 dakika'
        });
    }
});

const userLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 dakika
    max: 25, // IP başına maksimum istek
    message: {
        error: 'User endpoint\'i için çok fazla istek gönderdiniz. Lütfen 5 dakika sonra tekrar deneyin.',
        retryAfter: '5 dakika'
    },
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Rate limit aşıldı. Lütfen daha sonra tekrar deneyin.',
            retryAfter: '5 dakika'
        });
    }
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.User, Partials.GuildMember, Partials.Channel],
    ws: {
        properties: {
            browser: 'Discord iOS',
            $browser: 'Discord iOS'
        },
        large_threshold: 50,
        compress: true,
        timeout: 60000
    },
    rest: {
        timeout: 60000,
        retries: 5
    },
    shards: 'auto',
    failIfNotExists: false,
    waitGuildTimeout: 15000,
    sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
            interval: 3600,
            lifetime: 1800
        },
        users: {
            interval: 3600,
            filter: () => user => !user.bot
        }
    },
    makeCache: Options.cacheWithLimits({
        MessageManager: 100,
        PresenceManager: 10,
        UserManager: 10,
        GuildMemberManager: 10
    }),
    retryLimit: 5,
    presence: {
        status: 'online',
        activities: [{
            name: 'SetScript API',
            type: ActivityType.Watching
        }]
    }
});

const config = {
    token: "",
    serverid: "1329924162956820560"
}

// Bağlantı yönetimi güncelleniyor
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 5000;
let reconnectTimeout = null;

async function handleReconnect() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }

    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`Yeniden bağlanma denemesi ${reconnectAttempts}/${maxReconnectAttempts}`);
        
        try {
            if (client.ws) {
                client.ws.destroy();
            }

            // Bağlantı öncesi bekle
            await new Promise(resolve => setTimeout(resolve, reconnectDelay * reconnectAttempts));
            
            // Token geçerliliğini kontrol et
            try {
                await client.login(config.token);
                console.log('Yeniden bağlantı başarılı!');
                reconnectAttempts = 0;
            } catch (loginError) {
                console.error('Token hatası:', loginError);
                process.exit(1);
            }
        } catch (error) {
            console.error('Yeniden bağlanma hatası:', error);
            
            // Recursive çağrı yerine timeout kullan
            reconnectTimeout = setTimeout(() => {
                handleReconnect();
            }, reconnectDelay);
        }
    } else {
        console.error('Maksimum yeniden bağlanma denemesi aşıldı.');
        await gracefulShutdown();
    }
}

// WebSocket durum kontrolü
let wsCheckInterval = setInterval(() => {
    if (client && client.ws && client.ws.status === 6) { // 6 = WebSocketStatus.Closed
        handleReconnect();
    }
}, 30000);

// Client event handlers
client.on('disconnect', () => {
    handleReconnect();
});

client.on('error', error => {
    if (!error.message.includes('Connection reset by peer')) {
        console.error('Bot hatası:', error);
    }
    handleError(error);
});

client.on('warn', info => {
    console.warn('Bot uyarısı:', info);
});

client.on('debug', info => {
    if (info.includes('Heartbeat') || info.includes('Session')) {
        console.debug('Bot debug bilgisi:', info);
    }
});

client.on(Events.ClientReady, () => {
    console.log(`${client.user.tag} giriş yapıldı!`);
    reconnectAttempts = 0;
    
    // Presence'i güncelle
    client.user.setPresence({
        status: 'online',
        activities: [{
            name: 'SetScript API',
            type: ActivityType.Watching
        }]
    });
});

// Browser ve page pool yönetimi için global değişkenler
let browser = null;
const pagePool = [];
const MAX_PAGES = 3; // Maksimum page sayısı

// Browser'ı başlat
async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-web-security'
            ]
        });
    }
    return browser;
}

// Page pool'dan sayfa al
async function getPage() {
    if (pagePool.length > 0) {
        return pagePool.pop();
    }

    if (!browser) {
        await initBrowser();
    }

    const page = await browser.newPage();
    await page.setRequestInterception(true);
    
    // Gereksiz kaynakları engelle, Discord ve Spotify görsellerine izin ver
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        const url = req.url();
        
        // Discord ve Spotify görsellerine izin ver
        if (resourceType === 'image' && (
            url.includes('cdn.discordapp.com') || 
            url.includes('i.scdn.co')
        )) {
            req.continue();
            return;
        }

        // Diğer gereksiz kaynakları engelle
        if (resourceType === 'image' || 
            resourceType === 'font' || 
            resourceType === 'media' ||
            resourceType === 'stylesheet') {
            req.abort();
        } else {
            req.continue();
        }
    });

    // Timeout ayarı
    await page.setDefaultNavigationTimeout(10000);
    await page.setDefaultTimeout(10000);

    return page;
}

// Sayfayı pool'a geri koy
function releasePage(page) {
    if (pagePool.length < MAX_PAGES) {
        pagePool.push(page);
    } else {
        page.close();
    }
}

// Uygulama kapatıldığında browser'ı temizle
process.on('SIGINT', async () => {
    await gracefulShutdown();
});

// Process yönetimi ve hata yakalama
process.on('uncaughtException', (error) => {
    console.error('Beklenmeyen Hata:', error);
    handleError(error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('İşlenmeyen Promise Reddi:', reason);
    handleError(reason);
});

process.on('SIGTERM', async () => {
    await gracefulShutdown();
});

// Genel hata yönetimi
function handleError(error) {
    if (error.message.includes('WebSocket') || 
        error.message.includes('Connection reset')) {
        handleReconnect();
    }
}

// Temel hata yönetimi middleware'i
app.use((err, req, res, next) => {
    console.error('Hata:', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
});

// CORS Pre-flight istekleri için
app.options('*', cors());

// API endpoint'leri için header'ları ayarla
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'SetScript API');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    next();
});

// API dokümantasyonu endpoint'i
app.get('/docs', (req, res) => {
    res.json({
        version: '1.0.0',
        endpoints: {
            user: {
                url: '/users/:userId',
                method: 'GET',
                description: 'Kullanıcı bilgilerini JSON formatında döndürür',
                rateLimit: '25 istek / 5 dakika'
            },
            card: {
                url: '/users/card/:userId',
                method: 'GET',
                description: 'Kullanıcı kartını HTML veya PNG formatında döndürür',
                parameters: {
                    img: 'PNG formatında almak için ?img parametresi ekleyin'
                },
                rateLimit: '25 istek / 5 dakika'
            }
        },
        examples: {
            json: 'https://api.setscript.com/users/123456789',
            card: 'https://api.setscript.com/users/card/123456789',
            image: 'https://api.setscript.com/users/card/123456789?img'
        }
    });
});

// Health check endpoint'i
app.get('/health', (req, res) => {
    const guild = client.guilds.cache.get(config.serverid);
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        discord: {
            status: client.ws.status === WebSocketStatus.Ready ? 'connected' : 'disconnected',
            ping: client.ws.ping,
            guild: guild ? 'connected' : 'disconnected'
        }
    });
});

// Express sunucusu başlatma
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`API sunucusu http://localhost:${port} adresinde çalışıyor`);
});

// Server timeout ayarları
server.timeout = 60000; // 60 saniye
server.keepAliveTimeout = 65000; // 65 saniye

// Güvenli kapatma fonksiyonu
async function gracefulShutdown() {
    console.log('Uygulama güvenli bir şekilde kapatılıyor...');
    
    try {
        // Browser'ı kapat
        if (browser) {
            console.log('Browser kapatılıyor...');
            await browser.close();
        }

        // Discord client'ı kapat
        if (client) {
            console.log('Discord bağlantısı kapatılıyor...');
            await client.destroy();
        }

        // Express sunucusunu kapat
        if (server) {
            console.log('HTTP sunucusu kapatılıyor...');
            server.close();
        }

        console.log('Uygulama güvenli bir şekilde kapatıldı.');
        process.exit(0);
    } catch (error) {
        console.error('Kapatma sırasında hata:', error);
        process.exit(1);
    }
}

async function getUserBanner(userId, client) {
    try {
        const response = await fetch(`https://discord.com/api/v10/users/${userId}`, {
            method: 'GET',
            headers: {
                Authorization: `Bot ${config.token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return null;
            } else {
                throw new Error(`API hatası: ${response.status} ${response.statusText}`);
            }
        }

        const data = await response.json();
        const bannerHash = data.banner;

        if (bannerHash) {
            let format = 'png';
            if (bannerHash.startsWith('a_')) {
                format = 'gif';
            }
            return `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.${format}?size=1024`;
        } else {
            return null;
        }

    } catch (error) {
        console.error("Banner hatası:", error.message);
        return null;
    }
}

function getAssetURL(appId, assetId) {
    if (!assetId) return "";
    if (assetId.startsWith('spotify:')) {
        return `https://i.scdn.co/image/${assetId.replace('spotify:', '')}`;
    }
    // Discord CDN için doğru URL formatı
    return `https://cdn.discordapp.com/app-assets/${appId}/${assetId}`;
}

// Avatar URL'lerini düzeltme fonksiyonu
function getAvatarURL(user, options = {}) {
    if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;
    const format = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}?size=${options.size || 128}`;
}

// Emoji URL'lerini düzeltme fonksiyonu
function getEmojiURL(emoji) {
    if (!emoji) return "";
    
    // Discord özel emoji ise
    if (emoji.id) {
        const format = emoji.animated ? 'gif' : 'png';
        return `https://cdn.discordapp.com/emojis/${emoji.id}.${format}?size=48&quality=lossless`;
    }
    
    // Unicode/Default emoji ise
    if (emoji.name) {
        try {
            // Emoji'yi Unicode code point'e çevir
            const codePoints = [...emoji.name].map(char => {
                return char.codePointAt(0).toString(16);
            }).join('-');

            // GitHub'ın emoji CDN'ini kullan
            return `https://raw.githubusercontent.com/twitter/twemoji/master/assets/svg/${codePoints}.svg`;
        } catch (error) {
            console.error('Emoji dönüştürme hatası:', error);
            return "";
        }
    }
    
    return "";
}

app.get('/users/:userId', userLimiter, async (req, res) => {
    const userId = req.params.userId;

    try {
        const guild = client.guilds.cache.get(config.serverid);
        if (!guild) {
            return res.status(500).json({ error: 'Sunucu bulunamadı' });
        }

        try {
            // Önce cache'den kontrol et
            let member = guild.members.cache.get(userId);
            
            if (!member) {
                // Cache'de yoksa fetch et
                try {
                    member = await guild.members.fetch({ user: userId, withPresences: true });
                } catch (fetchError) {
                    console.error('Üye fetch hatası:', fetchError);
                    return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
                }
            }

            // Presence bilgisini güncelle
            if (!member.presence) {
                await guild.members.fetch({ user: userId, withPresences: true });
                member = guild.members.cache.get(userId);
            }

            const user = member.user;
            const presence = member.presence || {};
            const activities = presence.activities || [];
            
            // Spotify aktivitesini bul
            const spotifyActivity = activities.find(activity => 
                activity && activity.type === 2 && activity.name === 'Spotify'
            );

            // Custom status aktivitesini bul
            const customStatus = activities.find(activity => 
                activity && activity.type === 4
            );

            // Diğer aktiviteleri filtrele
            const otherActivities = activities.filter(activity => 
                activity && activity.type !== 2 && activity.type !== 4
            );

            const bannerURL = await getUserBanner(userId, client);
            const avatarURL = user.displayAvatarURL({ dynamic: true, size: 1024 }).replace('.webp', '.webp');

            const response = {
                user: {
                    id: user.id,
                    username: user.username,
                    tag: user.tag,
                    avatarURL: avatarURL,
                    bannerURL: bannerURL || "",
                    status: presence.status || 'offline',
                    activities: otherActivities.map(activity => ({
                        name: activity.name,
                        type: activity.type,
                        details: activity.details || "",
                        state: activity.state || "",
                        timestamps: activity.timestamps || null,
                        assets: activity.assets ? {
                            large_image: activity.assets.largeImage ? getAssetURL(activity.applicationId, activity.assets.largeImage) : null,
                            large_text: activity.assets.largeText || "",
                            small_image: activity.assets.smallImage ? getAssetURL(activity.applicationId, activity.assets.smallImage) : null,
                            small_text: activity.assets.smallText || ""
                        } : null,
                        applicationId: activity.applicationId || null
                    }))
                },
                spotify: spotifyActivity ? {
                    title: spotifyActivity.details || "",
                    artist: spotifyActivity.state || "",
                    albumName: spotifyActivity.assets?.largeText || "",
                    albumArtURL: spotifyActivity.assets?.largeImage ? `https://i.scdn.co/image/${spotifyActivity.assets.largeImage.replace('spotify:', '')}` : "",
                    trackId: spotifyActivity.syncId || "",
                    timestamps: spotifyActivity.timestamps || null
                } : null,
                customStatus: customStatus ? {
                    text: customStatus.state || "",
                    emoji: customStatus.emoji ? {
                        name: customStatus.emoji.name || "",
                        id: customStatus.emoji.id || "",
                        animated: customStatus.emoji.animated || false,
                        url: getEmojiURL(customStatus.emoji)
                    } : null
                } : null
            };

            console.log(`${user.username} için presence bilgileri:`, {
                status: presence.status,
                activitiesCount: activities.length,
                hasSpotify: !!spotifyActivity,
                hasCustomStatus: !!customStatus
            });

            res.json(response);

        } catch (fetchError) {
            console.error('Fetch hatası:', fetchError);
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

    } catch (error) {
        console.error("API Hatası:", error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Card endpoint'i
app.get('/users/card/:userId', cardLimiter, async (req, res) => {
    const userId = req.params.userId;
    const isImage = req.query.img !== undefined;

    try {
        const guild = client.guilds.cache.get(config.serverid);
        if (!guild) {
            return res.status(500).json({ error: 'Sunucu bulunamadı. Lütfen [discord](https://setscript.com/discord) adresine katılın.' });
        }

        let member;
        try {
            // Önce cache'den kontrol et
            member = guild.members.cache.get(userId);
            
            if (!member) {
                // Cache'de yoksa direkt ID ile fetch et
                try {
                    member = await guild.members.fetch(userId);
                } catch (fetchError) {
                    console.error('Üye fetch hatası:', fetchError);
                    return res.status(404).json({ error: 'Üye [discord](https://setscript.com/discord) sunucusunda bulunmuyor' });
                }
            }

            // Presence bilgisini güncelle
            if (!member.presence) {
                await guild.members.fetch({ user: userId, withPresences: true });
                member = guild.members.cache.get(userId);
            }

        } catch (error) {
            console.error('Üye fetch hatası:', error);
            return res.status(404).json({ error: 'Üye [discord](https://setscript.com/discord) sunucusunda bulunmuyor' });
        }

        if (!member || !member.user) {
            return res.status(404).json({ error: 'Üye [discord](https://setscript.com/discord) sunucusunda bulunmuyor' });
        }

        console.log(`${member.user.username}, ${isImage ? 'image' : 'card'}`);
        const user = member.user;
        const presence = member.presence;
        const activities = presence?.activities || [];
        const spotifyActivity = activities.find(activity => activity.name === 'Spotify' && activity.type === 2);
        const customStatusActivity = activities.find(act => act.type === 4);
        const otherActivities = activities.filter(act => act.type !== 2 && act.type !== 4);

        const presenceStatus = presence?.status || "offline";
        const statusColors = {
            online: '#43b581',
            idle: '#faa61a',
            dnd: '#f04747',
            offline: '#747f8d'
        };

        const getActivityIcon = (activity) => {
            if (!activity.assets?.largeImage) return '';
            if (activity.name === 'Spotify') {
                return activity.assets.largeImage || '';
            }
            const appId = activity.applicationId;
            const assetId = activity.assets.largeImage;
            return getAssetURL(appId, assetId);
        };

        const getActivitySmallIcon = (activity) => {
            if (!activity.assets?.smallImage) return '';
            if (activity.name === 'Spotify') {
                return activity.assets.smallImage || '';
            }
            const appId = activity.applicationId;
            const assetId = activity.assets.smallImage;
            return getAssetURL(appId, assetId);
        };

        // HTML şablonunu oluştur
        let cardHtml = cardTemplate;

        // Temel değişimler
        cardHtml = cardHtml
            .replace(/#username#/g, user.username)
            .replace(/#status-color#/g, statusColors[presenceStatus])
            .replace(/#avatar-url#/g, getAvatarURL(user, { size: 128 }));

        // Custom Status
        cardHtml = cardHtml
            .replace(/#custom-status-display#/g, customStatusActivity ? 'flex' : 'none')
            .replace(/#custom-status-emoji#/g, customStatusActivity?.emoji ? `<img class="custom-status-emoji" src="${getEmojiURL(customStatusActivity.emoji)}" alt="${customStatusActivity.emoji.name}" crossorigin="anonymous">` : '')
            .replace(/#custom-status-text#/g, customStatusActivity?.state || '');

        // Spotify Activity
        cardHtml = cardHtml
            .replace(/#spotify-display#/g, spotifyActivity ? 'block' : 'none')
            .replace(/#spotify-image#/g, spotifyActivity?.assets?.largeImage ? `https://i.scdn.co/image/${spotifyActivity.assets.largeImage.replace('spotify:', '')}` : '')
            .replace(/#spotify-title#/g, spotifyActivity?.details || '')
            .replace(/#spotify-artist#/g, spotifyActivity?.state || '');

        // Other Activities
        let activitiesHtml = otherActivities.map(activity => {
            const isVSCode = activity.name.toLowerCase().includes('visual studio code') || activity.name.toLowerCase().includes('vs code');
            const activityIcon = activity.assets?.largeImage ? getActivityIcon(activity) : '';
            const smallIcon = isVSCode && activity.assets?.smallImage ? getActivitySmallIcon(activity) : '';

            return `
            <div class="activity">
                <div class="activity-content">
                    ${activityIcon ? `<img class="activity-icon" src="${activityIcon}" alt="${activity.name}" crossorigin="anonymous">` : ''}
                    <div class="activity-info">
                        <div class="activity-name">
                            ${isVSCode && smallIcon ? `<img class="small-icon" src="${smallIcon}" alt="${activity.assets?.smallText || ''}" crossorigin="anonymous">` : ''}
                            ${activity.name}
                        </div>
                        ${activity.details ? `<div class="activity-details">${activity.details}</div>` : ''}
                        ${activity.state ? `<div class="activity-state">${activity.state}</div>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');

        cardHtml = cardHtml.replace(/#other-activities#/g, activitiesHtml);

        if (isImage) {
            try {
                const screenshot = await takeScreenshot(cardHtml);
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=60');
                res.send(screenshot);
            } catch (error) {
                console.error("Screenshot hatası:", error);
                res.status(500).json({ error: 'Görsel oluşturulurken bir hata oluştu' });
            }
        } else {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.send(cardHtml);
        }

    } catch (error) {
        console.error("Hata:", error);
        res.status(500).json({ error: 'Bir hata oluştu' });
    }
});

async function takeScreenshot(html) {
    if (!browser) {
        await initBrowser();
    }

    const page = await browser.newPage();
    try {
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = request.url();
            if (request.resourceType() === 'image' && (
                url.includes('cdn.discordapp.com') || 
                url.includes('i.scdn.co') ||
                url.includes('raw.githubusercontent.com')
            )) {
                request.continue();
            } else if (['stylesheet', 'font'].includes(request.resourceType())) {
                request.continue();
            } else {
                request.abort();
            }
        });

        await page.setViewport({
            width: 450,
            height: 200,
            deviceScaleFactor: 2
        });

        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });

        // Görsellerin yüklenmesini bekle
        await page.evaluate(async () => {
            const images = document.querySelectorAll('img');
            await Promise.all([...images].map(img => {
                if (img.complete) return;
                return new Promise((resolve) => {
                    img.addEventListener('load', resolve);
                    img.addEventListener('error', resolve);
                    setTimeout(resolve, 5000); // 5 saniye timeout
                });
            }));
        });

        const card = await page.evaluate(() => {
            const element = document.querySelector('.card');
            const { width, height } = element.getBoundingClientRect();
            return { width, height };
        });

        await page.setViewport({
            width: Math.ceil(card.width),
            height: Math.ceil(card.height),
            deviceScaleFactor: 2
        });

        const screenshot = await page.screenshot({
            type: 'png',
            omitBackground: true,
            clip: {
                x: 0,
                y: 0,
                width: Math.ceil(card.width),
                height: Math.ceil(card.height)
            }
        });

        return screenshot;
    } finally {
        await page.close();
    }
}

// Browser'ı başlat
initBrowser().catch(console.error);

client.login(config.token);
