# Deploying Node.js Backend on AWS EC2 (Amazon Linux 2023) with Nginx and HTTPS

**Purpose:** A concise, step-by-step deployment guide that documents what was done, why it was done, and how to troubleshoot common problems. Final target: `https://api-zg.codeprojekt.shop`.

---

## Final checklist (quick)
- [ ] Elastic IP allocated and associated
- [ ] Security group ports 22/80/443 open correctly
- [ ] Node app running and bound to `127.0.0.1:<port>`
- [ ] PM2 set up and `pm2 save` done
- [ ] Nginx reverse proxy configured and tested (`nginx -t`)
- [ ] DNS A record points to Elastic IP
- [ ] Certbot successfully obtained certificate
- [ ] HTTPS endpoint responds (curl -I https://api-zg.codeprojekt.shop/health)

---

## Overview
This guide walks through launching an EC2 instance, installing Node.js and dependencies, running the Node app using `pm2`, configuring Nginx as a reverse proxy, obtaining and installing a Let's Encrypt TLS certificate with `certbot`, and verifying that the API is available at `https://api-zg.codeprojekt.shop`.

Each step contains exact commands and short explanations of *why* we do it.

---

## Prerequisites
- AWS account and IAM access to launch EC2 and allocate an Elastic IP.
- A domain name (here: `codeprojekt.shop`) with DNS editable (Netlify DNS).
- A built Node.js app that listens on a local port (`8000`).
- A private key file for SSH access: `your-key.pem`.

> Note: the app listen on `127.0.0.1:8000` (not publicly exposed). 
---

## Security Group / Firewall
Open the following inbound rules for the EC2 instance's Security Group:
- SSH (TCP 22) — *restrict to our IP*
- HTTP (TCP 80) — `0.0.0.0/0`
- HTTPS (TCP 443) — `0.0.0.0/0`

---

## 1. Connect to the Instance
```bash
ssh -i /path/to/your-key.pem ec2-user@<ELASTIC_IP>
```
Why: use Elastic IP (static) so DNS always points to the same address.

---

## 2. Update OS and install essentials
```bash
sudo dnf update -y
sudo dnf install -y git curl wget build-essential
```
Why: keep the system patched and install utilities used later.

---

## 3. Install Node.js (LTS) and npm
Two common production approaches: NodeSource RPM (system-wide) or `nvm` (per-user). NodeSource is simpler for servers.

Example (Node 18 LTS):
```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v
```
Why: install a stable LTS Node.js so app runs with known compatibility.

---

## 4. Clone app & install dependencies
```bash
cd /home/ec2-user
git clone <your-repo-url> codeprojekt-backend
cd codeprojekt-backend
npm ci               # faster, uses package-lock.json
# or
npm install
```
Why: copy app to server and install exact dependencies.

---

## 5. Install and configure PM2 (process manager)
```bash
sudo npm install -g pm2
# start the app using the package.json script `prod-unix`
pm run build   # if the project needs building
pm run migrate # optional: run DB migrations if any
pm run env     # optional: ensure env vars are correct
# start with pm2 using the npm script name
pm2 start npm --name "codeprojekt-backend" -- run prod-unix

# Save process list and create startup systemd unit
pm2 save
# This prints a command; run it with sudo to generate startup service:
pm2 startup systemd -u ec2-user --hp /home/ec2-user
# Run the printed sudo command if any (pm2 will show it on stdout)
```
**Notes:**
- `pm2 save` stores the process list for startup.
- `pm2 startup` prints a platform-specific command — run it exactly as shown.

Why: `pm2` keeps the Node process alive, restarts on crashes, and can integrate with systemd for auto start after reboot.

---

## 6. Configure the Node app to bind to `localhost` only
Set `PORT=8000` and ensure the app listens on `127.0.0.1` rather than `0.0.0.0`.
Why: only Nginx should be accessible on external interfaces; Node should be private to the host.

Example pm2 ecosystem (optional) `ecosystem.config.js`:
```js
module.exports = {
  apps: [{
    name: 'codeprojekt-backend',
    script: 'npm',
    args: 'run prod-unix',
    env: {
      NODE_ENV: 'production',
      PORT: 8000,
      HOST: '127.0.0.1'
    }
  }]
}
```
Start with:
```bash
pm2 start ecosystem.config.js
pm2 save
```

---

## 7. Install and configure Nginx (reverse proxy)
```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo mkdir -p /etc/nginx/conf.d && sudo mkdir -p /var/www/api-zg
sudo nano /etc/nginx/conf.d/api-zg.conf
```
**Example Nginx config** (`/etc/nginx/conf.d/api-zg.conf`):
```nginx
server {
    listen 80;
    server_name api-zg.codeprojekt.shop;

    access_log /var/log/nginx/api-zg.access.log;
    error_log  /var/log/nginx/api-zg.error.log;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Then validate and reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```
Why: Nginx accepts traffic on ports 80/443 and forwards to the local Node port. Also allows termination of HTTPS.

---

## 8. DNS: point domain -> Elastic IP
If the DNS is managed in Netlify (or elsewhere):
- Create an **A** record for `api-zg` (subdomain) with value = Elastic IP of the EC2 instance.
- If using an apex domain (`codeprojekt.shop`) use an A record for `@`.

Check propagation:
```bash
dig +short api-zg.codeprojekt.shop
nslookup api-zg.codeprojekt.shop
```
Why: Let’s Encrypt will only issue certificates if the domain resolves to the server requesting the cert.

---

## 9. Obtain TLS certificate (Let’s Encrypt with Certbot)
Try the simple nginx installer which automatically updates configs:
```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api-zg.codeprojekt.shop
```
Follow prompts to obtain and install the certificate. Certbot will typically:
- Validate domain via HTTP-01 challenge
- Obtain certificate and save to `/etc/letsencrypt/live/api-zg.codeprojekt.shop/`
- Update Nginx conf to use the certificate and redirect HTTP → HTTPS
- Reload Nginx

**If the `--nginx` installer fails** (common causes & fixes below), fallback to `--webroot` or `certonly` then manually configure Nginx (example below).

**Manual (webroot) fallback:**
```bash
sudo certbot certonly --webroot -w /var/www/api-zg -d api-zg.codeprojekt.shop
# After cert is issued, edit nginx to add:
# ssl_certificate /etc/letsencrypt/live/api-zg.codeprojekt.shop/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/api-zg.codeprojekt.shop/privkey.pem;
# include /etc/letsencrypt/options-ssl-nginx.conf;
# ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

sudo nginx -t && sudo systemctl reload nginx
```

---

## 10. Confirm HTTPS is working
From the laptop or cloud shell:
```bash
curl -I https://api-zg.codeprojekt.shop/health
# or
curl -v https://api-zg.codeprojekt.shop/health
```
Also check:
```bash
sudo ss -tulpn | grep nginx
pm2 status
pm2 logs codeprojekt-backend --lines 200
sudo journalctl -u nginx -n 200 --no-pager
```
Why: ensure TLS is served and the app returns healthy responses.

---

## Common issues and how to fix them

### A. `certbot` error: "certificate saved but could not be installed (installer: nginx)"
**Symptoms:** Certbot obtains certs but fails to update nginx blocks.

**Causes & fixes:**
- Nginx config test fails: run `sudo nginx -t` and fix syntax errors.
- Server blocks don't contain `server_name` or the `server` handling port 80 is non-standard; certbot can't find the correct server to edit. Ensure `server_name api-zg.codeprojekt.shop;` exists in a conf file inside `/etc/nginx/conf.d/`.
- Permissions: certbot cannot write to `/etc/nginx/` if run with unusual permissions (rare). Run certbot with `sudo`.
- Custom or unusual nginx layout: certbot's `--nginx` plugin expects standard layout; use `--webroot` or `certonly` as fallback and then add the cert paths manually to nginx.

**Manual recovery example:**
1. `sudo nginx -t` — fix any errors.
2. If `--nginx` still fails: `sudo certbot certonly --webroot -w /var/www/api-zg -d api-zg.codeprojekt.shop` (ensure that `location /.well-known/acme-challenge/` is served by nginx or we created `/var/www/api-zg` and nginx maps it).
3. Edit the server block and add SSL directives pointing to the files in `/etc/letsencrypt/live/...`.
4. `sudo nginx -t && sudo systemctl reload nginx`.

### B. DNS not resolving / A record changes not taking effect
- DNS propagation may take minutes to hours depending on previous TTLs. Use `dig +trace` or `nslookup` to debug.
- Ensure we updated the *correct* DNS provider (Netlify dashboard as we use Netlify DNS). If we host DNS on the registrar, update there.

### C. `504` / Nginx times out when proxying
- Check the Node app is running and healthy: `pm2 status` and `pm2 logs`.
- Ensure Node app listens on the same port Nginx proxies to (`127.0.0.1:8000`).
- Increase proxy timeout in Nginx if the app legitimately needs longer to respond:
```nginx
proxy_connect_timeout 90s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;
```

### D. `ETIMEDOUT` to Redis or external services
- Check security groups, VPC/subnet routing, and whether required ports (e.g., Redis port 6379) are reachable from the EC2 instance.
- Use `telnet host port` or `redis-cli -h host -p 6379` to test connectivity.

---

## Maintenance & Hardening
- **Auto renew certs**: `sudo certbot renew --dry-run` to test renewal; Certbot usually installs a cron or systemd timer to renew automatically.
- **Auto-start**: ensure `pm2 save` and `pm2 startup` are configured so the app restarts after instance reboot.
- **Backups**: snapshot EC2 volumes or use AMIs before major changes.
- **Least privilege**: keep SSH restricted to our IP and use key-based auth only.
- **Monitoring & logs**: ship logs to CloudWatch or a centralized logging service.

---

## Useful commands (cheat-sheet)
```bash
# validate nginx
sudo nginx -t
sudo systemctl status nginx
sudo journalctl -u nginx -n 200

# check DNS
dig +short api-zg.codeprojekt.shop
nslookup api-zg.codeprojekt.shop

# check open ports/services
sudo ss -tulpn | egrep "(nginx|node|:8000|:3000)"

# pm2
pm2 status
pm2 logs codeprojekt-backend --lines 200
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# certbot
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## Appendix A — Example manual HTTPS server block
If we used `certonly`, add the following to `/etc/nginx/conf.d/api-zg-ssl.conf`:
```nginx
server {
    listen 443 ssl http2;
    server_name api-zg.codeprojekt.shop;

    ssl_certificate /etc/letsencrypt/live/api-zg.codeprojekt.shop/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api-zg.codeprojekt.shop/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;   # managed by Certbot

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}

# Optionally redirect HTTP to HTTPS
server {
    listen 80;
    server_name api-zg.codeprojekt.shop;
    return 301 https://$host$request_uri;
}
```

---

