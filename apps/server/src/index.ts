import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'colyseus';
import { BattleRoom } from './rooms/BattleRoom';

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

// Health check cho deploy / docker
app.get('/health', (_req, res) => res.json({ ok: true, game: 'aoe-vn' }));

const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

// 1 room = 1 trận. Client joinOrCreate('battle').
gameServer.define('battle', BattleRoom);

httpServer.listen(PORT, () => {
  console.log(`[server] Đế Chế Việt Nam listening on ws://localhost:${PORT}`);
});
