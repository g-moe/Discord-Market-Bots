## Discord Ticker 🤖🤖🤖 Setup

### Requirements

- Linux VPS Server (I use Linode)
  - [My VPS Provider](https://www.linode.com/lp/refer/?r=3eabea16dddc74fdc11ae5d0a73cd919c1ed1ae0)
- Docker
- Discord Server
- Discord Bot

---

### 1. Clone Git Repo

```bash
git clone https://github.com/g-moe/Discord-Ticker-Bots
cd Discord-Ticker-Bots/services
```

---

### 2. Set .env vars and bots.json info

```bash
sudo nano ./services/.env
sudo nano ./tickers/bots.json
```
---

### 3. Run Docker Compose

```bash
docker compose up --build -d
```

---

### 4. Edit nginx config for data

```bash
sudo nano /etc/nginx/sites-available/app.conf
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
