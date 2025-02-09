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

const config = {
    token: "",
    serverid: ""
}

client.on(Events.ClientReady, () => {
    console.log(`${client.user.tag} giriş yapıldı!`);
});

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
        console.log(data)
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
        console.error("Kullanıcı bannerı hata:", error);
        return null;
    }
}


app.get('/users/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const guild = client.guilds.cache.get(config.serverid);

        if (!guild) {
            return res.status(500).json({ error: 'Sunucu bulunamadı. Lütfen discord.gg/setscript adresine katılın.' });
        }

        const member = await guild.members.fetch(userId);

        if (!member) {
            return res.status(404).json({ error: 'Kullanıcı sunucuda bulunamadı. Lütfen discord.gg/setscript adresine katılın.' });
        }

        const user = member.user;
        const presence = member.presence;

        const activities = presence?.activities || [];
        const spotifyActivity = activities.find(activity => activity.name === 'Spotify' && activity.type === 2);

        const presenceStatus = presence?.status || "Bilinmiyor";
        const clientStatus = presence?.clientStatus || "Bilinmiyor";

        let customStatus = null;
        if (member.presence && member.presence.status === "custom") {
            customStatus = member.presence.activities.find(act => act.type === 4);
        }

        const bannerURL = await getUserBanner(userId, client);

        res.json({
            user: {
                id: user.id,
                username: user.username,
                tag: user.tag,
                avatarURL: user.displayAvatarURL({ dynamic: true }),
                bannerURL: bannerURL,
            },
            presence: {
                status: presenceStatus,
                clientStatus: clientStatus,
                customStatus: customStatus ? {
                    text: customStatus.state,
                    emoji: customStatus.emoji ? {
                        name: customStatus.emoji.name,
                        id: customStatus.emoji.id,
                        animated: customStatus.emoji.animated,
                        url: customStatus.emoji.url,
                    } : null
                } : null,
            },
            spotify: spotifyActivity ? {
                title: spotifyActivity.details,
                artist: spotifyActivity.state,
                albumArtURL: spotifyActivity.assets?.largeImageURL(),
                albumArtURLSmall: spotifyActivity.assets?.smallImageURL(),
                timestamps: spotifyActivity.timestamps,
                track_id: spotifyActivity.syncId,
                party: spotifyActivity.party,
                assets: spotifyActivity.assets ? {
                    large_image: spotifyActivity.assets.largeImage,
                    large_text: spotifyActivity.assets.largeText
                } : null
            } : "Spotify bilgisi bulunamadı",
            activities: activities.length > 0 ? activities.map(activity => ({
                name: activity.name,
                type: activity.type,
                details: activity.details,
                state: activity.state,
                emoji: activity.emoji ? {
                    name: activity.emoji.name,
                    id: activity.emoji.id,
                    animated: activity.emoji.animated,
                    url: activity.emoji.url,
                } : null,
                timestamps: activity.timestamps,
                assets: activity.assets ? {
                    large_image: activity.assets.largeImage,
                    large_text: activity.assets.largeText
                } : null,
                session_id: activity.session_id,
                party: activity.party,
                sync_id: activity.sync_id
            })) : "Etkinlik bilgisi bulunamadı",
        });

    } catch (error) {
        console.error("Hata:", error);
        res.status(500).json({ error: 'Bir hata oluştu' });
    }
});


client.login(config.token);

app.listen(port, () => {
    console.log(`API sunucusu ${port} portunda çalışıyor`);
});
