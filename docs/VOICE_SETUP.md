# Setup vocal LiveKit — VPS Hostinger (Ubuntu 22.04)

Guide pas-à-pas pour déployer le serveur LiveKit auto-hébergé qui propulse le
chat vocal de groupe. Cible : **Hostinger KVM 2** (~7 €/mois, 2 vCPU, 8 Go RAM,
100 Mbps non-mesuré). Largement suffisant jusqu'à ~500 DAU simultanés.

> Toutes les commandes shell sont à exécuter **sur le VPS** sauf mention
> explicite "depuis Windows / votre poste". Toutes les commandes Windows
> s'exécutent dans **PowerShell** (pas CMD).

---

## 0. Pré-requis

- VPS Hostinger KVM 2 fraîchement réinstallé en **Ubuntu 22.04 LTS**
- Domaine `gametrend.app` (DNS modifiable)
- OpenSSH client présent par défaut sur Windows 10/11 → `ssh` et `scp`
  fonctionnent dans PowerShell sans installation
- Repo `gametrend` cloné en local sur Windows

---

## 1. Récupérer les infos du VPS dans hPanel

1. **hPanel → VPS → ton serveur → Overview**
2. Noter :
   - **IP publique** (ex. `72.61.142.18`) → on l'appellera `VPS_IP` ci-dessous
   - **Mot de passe root** affiché après la réinstallation OS (cliquer
     "Show" si masqué). Si tu ne l'as plus : panel → **Settings → Root
     password → Generate new**.
3. **Hostname** (onglet "Settings") : tu peux le passer à `livekit.prod` si
   tu veux. Optionnel.

---

## 2. Configurer le DNS

> Le domaine `gametrend.app` est nécessaire pour que Caddy obtienne un certif
> Let's Encrypt automatique. Le sous-domaine `livekit.gametrend.app` doit
> pointer vers l'IP du VPS.

### Si ton DNS est géré chez Hostinger

1. **hPanel → Domains → gametrend.app → DNS / Nameservers → DNS records**
2. **Add new DNS record** :
   - **Type** : `A`
   - **Name** : `livekit`
   - **Points to** : `VPS_IP`
   - **TTL** : `300`
3. **Save**

### Si ton DNS est ailleurs (Cloudflare, OVH, etc.)

Crée le même enregistrement A chez ton registrar. Si tu utilises Cloudflare,
**désactive le proxy orange** (cloud gris seulement) sinon le WebSocket sera
intercepté.

### Vérifier la propagation

Depuis Windows, dans PowerShell :

```powershell
nslookup livekit.gametrend.app
```

Tu dois voir `VPS_IP` dans la réponse. La propagation prend de quelques
secondes à 30 minutes selon le TTL antérieur.

---

## 3. Première connexion SSH

Depuis Windows, dans PowerShell :

```powershell
ssh root@VPS_IP
```

Premier prompt : taper `yes` pour accepter l'empreinte du serveur, puis le
mot de passe root copié depuis hPanel (clic-droit pour coller dans
PowerShell).

> Astuce : pour ne pas retaper le mot de passe à chaque fois, tu peux
> ajouter ta clé publique SSH (`~/.ssh/id_ed25519.pub`) dans
> `/root/.ssh/authorized_keys` du VPS. Étape facultative, ignore-la si tu
> ne sais pas ce que c'est.

---

## 4. Mise à jour du système et utilitaires de base

```bash
apt update && apt upgrade -y
apt install -y curl ca-certificates gnupg lsb-release ufw nano htop
```

---

## 5. Pare-feu UFW

```bash
# Reset propre (au cas où des règles traînent)
ufw --force reset

# Règles entrantes
ufw allow 22/tcp           # SSH
ufw allow 80/tcp           # HTTP (Let's Encrypt challenge)
ufw allow 443/tcp          # HTTPS / WSS (Caddy)
ufw allow 7881/tcp         # LiveKit TCP fallback (si UDP bloqué côté client)
ufw allow 50000:60000/udp  # LiveKit médias UDP (audio Opus)
ufw allow 3478             # Coturn STUN/TURN (UDP+TCP)
ufw allow 5349/tcp         # Coturn TURN/TLS
ufw allow 49152:49999/udp  # Coturn relais

# Activer
ufw --force enable
ufw status verbose
```

Sortie attendue : `Status: active` et la liste des ports ci-dessus.

---

## 6. Installer Docker (repo officiel)

> On installe via le repo officiel Docker, pas `apt install docker.io` qui
> peut être en retard de plusieurs versions majeures.

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

# Vérifier
docker --version          # → Docker version 27.x
docker compose version    # → Docker Compose version v2.x
```

---

## 7. Copier les fichiers infra depuis Windows vers le VPS

### 7.1 Créer le dossier sur le VPS

```bash
mkdir -p /opt/livekit/coturn
```

### 7.2 Depuis Windows (PowerShell), depuis la racine du repo `gametrend`

```powershell
$VPS = "VPS_IP"  # remplace par ton IP

scp gametrend/infra/livekit/docker-compose.yml      root@${VPS}:/opt/livekit/
scp gametrend/infra/livekit/livekit.yaml            root@${VPS}:/opt/livekit/
scp gametrend/infra/livekit/Caddyfile               root@${VPS}:/opt/livekit/
scp gametrend/infra/livekit/coturn/turnserver.conf  root@${VPS}:/opt/livekit/coturn/
```

Vérifier sur le VPS :

```bash
ls -la /opt/livekit /opt/livekit/coturn
```

Tu dois voir les 4 fichiers.

---

## 8. Générer les clés LiveKit

```bash
docker run --rm livekit/livekit-server generate-keys
```

Sortie type :

```
API Key: APIabc123def4567
API Secret: secret_aBcD1234eFgH5678iJkL9012mNoP3456qRsT7890
```

**⚠️ Garde ces deux valeurs en lieu sûr** (note locale, gestionnaire de mots
de passe). On les utilise à 3 endroits :

1. `/opt/livekit/livekit.yaml` (étape 9)
2. Variables d'env Vercel (étape 12)
3. Aucun autre — c'est le client Next.js qui les utilise via les env Vercel

Génère aussi le secret Coturn :

```bash
openssl rand -hex 32
# → ex. 7f3c8e2a9b1d4f5e6a7c8b9e0d1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f
```

Note-le aussi.

---

## 9. Éditer les configs sur le VPS

### 9.1 livekit.yaml

```bash
nano /opt/livekit/livekit.yaml
```

Trouver la section `keys:` et remplacer :

```yaml
keys:
  REPLACE_API_KEY: REPLACE_API_SECRET_AT_LEAST_32_CHARS
```

par (exemple, avec **tes** valeurs de l'étape 8) :

```yaml
keys:
  APIabc123def4567: secret_aBcD1234eFgH5678iJkL9012mNoP3456qRsT7890
```

> Format strict : `API_KEY: API_SECRET` (deux-points + espace). Le secret
> doit faire **32 caractères ou plus**.

Sauvegarder : `Ctrl+O` → `Enter` → `Ctrl+X`.

### 9.2 turnserver.conf

```bash
nano /opt/livekit/coturn/turnserver.conf
```

Remplacer 3 placeholders :

| Placeholder                | Remplacer par                            |
| -------------------------- | ---------------------------------------- |
| `PUBLIC_IP`                | l'IP publique du VPS (ex. `72.61.142.18`) |
| `TURN_REALM`               | `gametrend.app`                          |
| `TURN_STATIC_AUTH_SECRET`  | le secret généré avec `openssl rand`     |

Sauvegarder.

### 9.3 Caddyfile

Le Caddyfile est déjà prêt si tu utilises bien `livekit.gametrend.app`. Si
tu as choisi un autre sous-domaine, ouvre `/opt/livekit/Caddyfile` et change
la première ligne.

---

## 10. Démarrer la stack

```bash
cd /opt/livekit
docker compose up -d
```

Premier `up` : Docker télécharge les images (livekit, caddy, coturn). 1-2 min.

Vérifier que tout tourne :

```bash
docker compose ps
```

Sortie attendue : 3 services `running` ou `up`.

Suivre les logs LiveKit :

```bash
docker compose logs -f livekit
```

Tu dois voir une ligne du genre :

```
starting LiveKit server, version=v1.x.x
```

`Ctrl+C` pour quitter le suivi (les conteneurs continuent de tourner).

---

## 11. Vérifier que tout est joignable

### 11.1 Caddy a-t-il obtenu un certif Let's Encrypt ?

```bash
docker compose logs caddy | grep -E "obtained certificate|certificate obtained"
```

Tu dois voir une ligne du type `obtained certificate` pour
`livekit.gametrend.app`. Si pas de match : voir la section **Dépannage**.

### 11.2 Test depuis Internet

Depuis Windows (PowerShell) :

```powershell
curl.exe https://livekit.gametrend.app
```

Réponse attendue : `OK` (le serveur LiveKit retourne `OK` sur la racine HTTP).

### 11.3 Test WebSocket

```powershell
curl.exe -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" https://livekit.gametrend.app/rtc
```

Réponse attendue : `HTTP/2 101` ou `HTTP/1.1 101 Switching Protocols`.

---

## 12. Configurer Vercel

1. Aller sur **Vercel → Projet GameTrend → Settings → Environment Variables**
2. Ajouter ces 4 variables, **scope : Production + Preview** (cocher les deux) :

| Variable                  | Valeur                                |
| ------------------------- | ------------------------------------- |
| `LIVEKIT_URL`             | `wss://livekit.gametrend.app`         |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://livekit.gametrend.app`         |
| `LIVEKIT_API_KEY`         | l'API Key de l'étape 8                |
| `LIVEKIT_API_SECRET`      | l'API Secret de l'étape 8             |

3. **Redeploy** : Deployments → ⋯ sur le dernier deploy → Redeploy → Use
   existing build cache **décoché** → Redeploy.

---

## 13. Validation end-to-end

1. Ouvrir GameTrend sur **deux navigateurs différents** (ex. Chrome + Firefox,
   ou Chrome normal + fenêtre privée) avec **deux comptes différents**.
2. Sur le compte A : créer/rejoindre un groupe.
3. Sur le compte A : inviter le compte B comme ami puis dans le groupe.
4. Sur le compte B : accepter l'invitation groupe.
5. Sur les deux comptes : ouvrir le panneau du groupe (icône en header) →
   onglet **Membres** → **Rejoindre le vocal**.
6. Sur l'un des deux : cliquer le micro 🎙️ → il passe en vert 🎤 → parler.
7. L'autre doit entendre clairement (autoriser le micro dans les permissions
   navigateur si c'est la première fois).
8. Tester le mute host : depuis A (host), bouton "Couper" sur la ligne de B →
   chez B, l'icône passe en 🔇 et le toggle est désactivé.
9. Tester la persistance in-game : entrer dans un lobby Outbid/DYP → le
   mini-overlay vocal doit rester visible en bas-gauche, le vocal continue.

---

## 14. Mise à jour de LiveKit

```bash
cd /opt/livekit
docker compose pull
docker compose up -d
```

Pas de downtime sur les rooms vides ; les rooms actives sont reset (acceptable
pour du vocal informel).

---

## 15. Monitoring (optionnel mais recommandé)

LiveKit expose un endpoint de healthcheck. Brancher un check uptime gratuit
type **UptimeRobot** ou **Better Stack** sur :

```
https://livekit.gametrend.app
```

Avec une vérification toutes les 5 min, tu seras alerté en cas de panne.

Pour voir la consommation en temps réel sur le VPS :

```bash
htop                       # CPU + RAM live
docker stats --no-stream   # par conteneur
```

---

## 16. Coûts récapitulatifs

| Poste                  | Coût mensuel              |
| ---------------------- | ------------------------- |
| VPS Hostinger KVM 2    | ~7 € HT                   |
| Domaine `gametrend.app`| déjà payé                 |
| Bande passante         | inclus (100 Mbps non-mesuré) |
| **Total**              | **~7 €/mois**             |

Capacité indicative : ~30 rooms simultanées de 4 participants, ou ~10 rooms
de 16 participants. Au-delà : passer en KVM 4 (~12 €/mois).

---

## 17. Dépannage

### Pas de cert Let's Encrypt obtenu

1. Vérifier que `livekit.gametrend.app` pointe bien vers le VPS :
   ```bash
   dig +short livekit.gametrend.app
   ```
   Doit retourner `VPS_IP`.
2. Vérifier que les ports 80 et 443 sont ouverts dans UFW (`ufw status`).
3. Logs Caddy : `docker compose logs caddy | tail -50`
4. Si rate-limit Let's Encrypt : attendre 1h, ou utiliser le staging
   (modifier le Caddyfile avec `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory`).

### Audio coupé / saccadé / personne ne s'entend

1. Vérifier les ports UDP : `ufw status | grep udp`
2. Si NAT strict côté client (entreprise/école) : Coturn doit relayer.
   Logs : `docker compose logs coturn | tail`
3. Vérifier `external-ip` dans `turnserver.conf` (= IP publique du VPS).

### `livekit_not_configured` (503) côté Vercel

Variables d'env manquantes ou mal nommées. Re-vérifier les 4 noms exactement
(case-sensitive) et redeploy.

### "permission_failed" quand l'host mute un membre

L'`API Key` / `API Secret` côté Vercel ne correspond pas à ceux de
`livekit.yaml`. Re-coller depuis ta note sécurisée et redeploy.

### Reconnexion en boucle côté client

1. Console navigateur → onglet Network → filtrer `wss` :
   - Si le WSS reste en `pending` : firewall réseau du client bloque WS.
     Coturn doit prendre le relais (ports 5349/tcp, 3478/udp).
   - Si le WSS retourne 502 : Caddy ne joint pas LiveKit.
     `docker compose ps` doit montrer LiveKit `Up`.

### Le serveur ne démarre plus après reboot

```bash
systemctl status docker
docker compose -f /opt/livekit/docker-compose.yml ps
```

Si Docker ne tourne pas : `systemctl enable --now docker`. Pour redémarrer
manuellement la stack : `cd /opt/livekit && docker compose up -d`.

---

## 18. Quick reference (à garder sous la main)

```bash
# Statut de la stack
cd /opt/livekit && docker compose ps

# Logs en direct (filtrer sur livekit, caddy, ou coturn)
docker compose logs -f livekit
docker compose logs -f caddy
docker compose logs -f coturn

# Redémarrage rapide
docker compose restart livekit

# Mise à jour
docker compose pull && docker compose up -d

# Arrêt complet (urgence)
docker compose down

# Re-démarrage
docker compose up -d

# Ressources
htop
docker stats
df -h            # espace disque
free -h          # RAM
```
