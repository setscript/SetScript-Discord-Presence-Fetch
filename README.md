# SetScript Discord Presence API

Discord kullanıcı durumlarını ve aktivitelerini gerçek zamanlı olarak takip etmek için RESTful API servisi.

## 🚀 Özellikler

- Kullanıcı durumu ve aktiviteleri (JSON)
- Özelleştirilebilir presence kartı (HTML/PNG)
- Spotify aktivite bilgisi
- Custom status desteği
- Emoji desteği (Discord ve Unicode)
- Rate limiting ve DDoS koruması

## 📚 API Kullanımı

### Kullanıcı Bilgilerini Al (JSON)

```bash
GET http://localhost:5550/users/:userId
```

Örnek yanıt:
```json
{
  "user": {
    "id": "123456789",
    "username": "username",
    "tag": "username#0000",
    "avatarURL": "https://cdn.discordapp.com/avatars/..."
  },
  "presence": {
    "status": "online",
    "customStatus": {
      "text": "Hello World",
      "emoji": { ... }
    }
  },
  "spotify": {
    "title": "Song Name",
    "artist": "Artist Name",
    "albumArtURL": "https://i.scdn.co/image/..."
  },
  "activities": [ ... ]
}
```

### Presence Kartı Al (HTML/PNG)

HTML formatında:
```bash
GET http://localhost:5550/users/card/:userId
```

PNG formatında:
```bash
GET http://localhost:5550/users/card/:userId?img
```

### API Durumu

```bash
GET http://localhost:5550/health
```

### API Dokümantasyonu

```bash
GET http://localhost:5550/docs
```

## 📦 Kurulum

1. Repoyu klonlayın:
```bash
git clone https://github.com/setscript/SetScript-Discord-Presence-Fetch.git
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. Uygulamayı başlatın:
```bash
npm start
```

## 🔒 Rate Limiting

- Her endpoint için 5 dakikada 25 istek
- Burst limiti: 1 saniyede maksimum 10 istek
- IP bazlı rate limiting

## 📝 Örnekler

### Node.js ile Kullanım
```javascript
const response = await fetch('http://localhost:5550/users/123456789');
const data = await response.json();
console.log(data.presence.status);
```

### Python ile Kullanım
```python
import requests

response = requests.get('http://localhost:5550/users/123456789')
data = response.json()
print(data['presence']['status'])
```

### HTML/JavaScript ile Kullanım
```html
<img src="http://localhost:5550/users/card/123456789?img" alt="Discord Presence">
```

## ⚠️ Notlar

- API'yi kullanmak için kullanıcının Discord sunucumuzda olması gerekiyor
- Rate limit aşımında 429 status kodu döner
- Kullanıcı bulunamadığında 404 status kodu döner
- Sunucu hatalarında 500 status kodu döner

## 🔗 Linkler

- [Discord Sunucumuz](https://setscript.com/discord)
- [API Dokümantasyonu](https://developer.setscript.com)
- [Website](https://setscript.com)

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.
