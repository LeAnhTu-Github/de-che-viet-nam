import { Client, Room } from 'colyseus.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';

let client: Client | null = null;
let room: Room | null = null;

/** Kết nối tới server game (Colyseus). Gọi 1 lần khi vào màn hình game. */
export async function connectToBattle(playerName: string): Promise<Room> {
  if (room) return room;
  client = new Client(SERVER_URL);
  room = await client.joinOrCreate('battle', { playerName });
  console.log('[net] đã vào phòng battle:', room.roomId);
  return room;
}

/** Rời phòng khi quay lại menu. */
export function disconnectFromBattle(): void {
  if (room) {
    try {
      void room.leave();
    } catch {
      /* đã rời rồi thì bỏ qua */
    }
    room = null;
  }
}

/** Tạo phòng battle mới (Phase 6b lobby): người tạo là ghế đầu tiên. */
export async function createBattle(playerName: string): Promise<Room> {
  disconnectFromBattle();
  client = client ?? new Client(SERVER_URL);
  room = await client.create('battle', { playerName });
  console.log('[net] đã tạo phòng battle:', room.roomId);
  return room;
}

/** Vào phòng bằng roomId đầy đủ (Phase 6b lobby). */
export async function joinBattleById(roomId: string, playerName: string): Promise<Room> {
  disconnectFromBattle();
  client = client ?? new Client(SERVER_URL);
  room = await client.joinById(roomId, { playerName });
  console.log('[net] đã vào phòng battle:', room.roomId);
  return room;
}

export function getRoom(): Room | null {
  return room;
}
