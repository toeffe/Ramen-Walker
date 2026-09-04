<p align="center">
  <img src="src/banner.png" alt="🍜 Ramen Walker" width="840">
</p>

> *A random "scary" game about a player who just wants to get home with his favorite ramen.*

**Play it now:** [scary.toeffe.uk](https://scary.toeffe.uk/)

---

## 🎮 About the Game

You are carrying dinner down a road that does not want you to finish. Keep the bowl on the tray. Do not look back.

**Ramen Walker** is a short atmospheric horror experience built around a simple, tense premise: balance your ramen bowl on a tray while walking home through an increasingly hostile environment. The tension builds as you struggle to keep your meal intact — and your nerves steady.

Play solo, or **walk with someone**: one person walks, the other keeps the bowl on the tray.

---

## 🕹️ Controls

Solo (and the **Walker** in co-op):

| Key | Action |
|-----|--------|
| **W A S D** | Walk |
| **Mouse Left / Right** | Keep the bowl balanced on the tray *(solo only)* |
| **Hold Left Click** | Look around |
| **Shift** | Hurry *(not recommended)* |

The **Waiter** (co-op balancer) only tilts the tray: click to lock the mouse, then move left / right. They face the walker the whole way.

---

## 👥 Two players, one tray

From the title screen, **walk with someone →**.

1. One player **HOST — I'll walk**. Share the invite link or the 5-character room code.
2. The other **JOIN — I'll balance** (paste the code, or open the `?lobby=CODE` link).
3. When both show **Connected**, the walker clicks **BEGIN WALK**. The waiter follows automatically.

The walker walks and looks. The waiter sees the tray from the other side and keeps the bowl from spilling. Voice, scares, and the ending play for both.

Rooms are peer-to-peer (no game server). First connect can take a few seconds. If someone disconnects, there is no reconnect yet — start a new room. Same-browser tabs can throttle the background window; two windows or two browsers work better.

---

## 🛠️ Tech Stack

- Built with web technologies (HTML5 / JavaScript / WebGL)
- Hosted at [scary.toeffe.uk](https://scary.toeffe.uk/)

---

## 🚀 Getting Started

### Play Online
Simply visit **[scary.toeffe.uk](https://scary.toeffe.uk/)** to play directly in your browser.

### Run Locally
```bash
git clone https://github.com/toeffe/Ramen-Walker.git
cd Ramen-Walker
npm install
npm run dev
```

Open **http://localhost:8080**. For co-op on one machine, use two windows (or two browsers), host in one and join in the other.

---

## 📁 Project Structure

```
Ramen-Walker/
├── index.html          # Main game entry point
├── assets/             # Game assets (images, audio, models)
├── js/                 # Game logic & mechanics
├── css/                # Styling
└── README.md           # This file
```

---

## 🎯 Gameplay Tips

- **Balance is everything** — small, gentle mouse movements keep the bowl steady.
- **Don't rush** — Shift makes you faster, but also far more unstable.
- **Resist the urge to look back** — the road has a way of punishing curiosity.
- **Co-op:** the waiter should click the view once so voice and scares can play.

---

## 📝 License

This project is open source. See the repository for license details.

---

## 👤 Author

Made with 🍜 by **[toeffe](https://github.com/toeffe)**

---

*Keep the bowl on the tray.*