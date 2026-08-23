import { RoomStore } from "../rooms/room-store.js";

export class LeaseManager {
  private readonly timer: NodeJS.Timeout;

  constructor(
    roomStore: RoomStore,
    onRoomsChanged: (roomCodes: Set<string>) => void,
    sweepMs = 30_000,
  ) {
    this.timer = setInterval(() => {
      const roomCodes = new Set(
        roomStore
          .expireActivities()
          .map((playerId) => roomStore.findPlayer(playerId)?.room.code)
          .filter((code): code is string => Boolean(code)),
      );
      if (roomCodes.size > 0) onRoomsChanged(roomCodes);
    }, sweepMs);
    this.timer.unref();
  }

  close(): void {
    clearInterval(this.timer);
  }
}
