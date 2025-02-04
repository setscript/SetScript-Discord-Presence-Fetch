const express = require('express');
const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');

const app = express();
const port = 3002;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.User, Partials.GuildMember, Partials.Channel]
});

client.on(Events.ClientReady, () => {
    console.log(`${client.user.tag} adıyla giriş yapıldı!`);
});

app.get('/users/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const guild = client.guilds.cache.get("1336412155137888266");

        if (!guild) {
            return res.status(500).json({ error: 'Kullanıcı sunucuda bulunmamakta, lütfen discord.gg/setscript adresine giriş yapınız.' });
        }

        const member = await guild.members.fetch(userId);

        if (!member) {
            return res.status(404).json({ error: 'Kullanıcı sunucuda bulunmamakta, lütfen discord.gg/setscript adresine giriş yapınız.' });
        }

        const user = member.user;
        const presence = member.presence;

        const activities = presence?.activities || [];

        const spotifyActivity = activities.find(activity => activity.name === 'Spotify' && activity.type === 2);

        res.json({
            user: {
                id: user.id,
                username: user.username,
                tag: user.tag,
                avatarURL: user.displayAvatarURL(),
            },
            presence: {
                status: presence?.status || "Bilinmiyor",
                clientStatus: presence?.clientStatus || "Bilinmiyor",
            },
            spotify: spotifyActivity ? {
                title: spotifyActivity.details,
                artist: spotifyActivity.state,
                albumArtURL: spotifyActivity.assets?.large_image_url,
            } : "Spotify bilgisi bulunamadı",
            activities: activities.length > 0 ? activities.map(activity => ({
                name: activity.name,
                type: activity.type,
                details: activity.details,
                state: activity.state,
            })) : "Durum bilgisi bulunamadı",
        });

    } catch (error) {
        console.error("Hata:", error);
        if (error.code === 10013) {
            res.status(404).json({ error: 'Kullanıcı sunucuda bulunmamakta, lütfen discord.gg/setscript adresine giriş yapınız.' });
        } else {
            res.status(500).json({ error: 'Kullanıcı sunucuda bulunmamakta, lütfen discord.gg/setscript adresine giriş yapınız.' });
        }
    }
});


client.login("");

app.listen(port, () => {
    console.log(`API sunucusu ${port} portunda çalışıyor`);
});