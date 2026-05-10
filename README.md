# ☠️ GHOST BAN ☠️

Advanced WhatsApp Group Management Tool with Web Dashboard

## 🚀 Deploy to Render

### 1. Push to GitHub
Upload these files to your GitHub repo:
- `index.js`
- `package.json`
- `render.yaml`
- `public/index.html`
- `ghost_ban_profile.jpg` (optional)

### 2. Deploy on Render
1. Go to [render.com](https://render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repo
4. Render will auto-detect `render.yaml`
5. Set environment variable:
   - `ACCESS_KEY` = your secret key (e.g. `GHOST-BAN-2026`)
6. Deploy!

### 3. Access Your Bot
- Open your Render URL
- Enter your `ACCESS_KEY` in the gateway
- Start using the dashboard!

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCESS_KEY` | ✅ | Secret key to access dashboard |
| `PORT` | Auto | Render sets this automatically |

## 🎨 Features

- ☠️ Scary cyber-themed dark UI (red/black)
- 🔐 Access key gateway login
- 📱 WhatsApp pairing via web
- 💀 Ghost Ban (trap group creator)
- ⭐ Premium user management
- 📊 Real-time status monitoring

## 🛠️ API Endpoints

All endpoints require `X-Access-Key` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/pair` | Pair WhatsApp number |
| POST | `/api/ban` | Execute ghost ban |
| GET | `/api/connections` | List active connections |
| POST | `/api/addprem` | Add premium user |
| POST | `/api/delprem` | Remove premium user |
| GET | `/api/listprem` | List premium users |

## ⚠️ Disclaimer

This tool is for educational purposes only. Use responsibly.
