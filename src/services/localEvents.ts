// src/services/localEvents.ts
//
// EventBus simples baseado em pub/sub.
// Usado para que diferentes partes do app conversem sem passar props longas.
//
// Exemplo de eventos:
//   - 'pet:set-state'        -> { petId, state }
//   - 'pet:task-update'      -> { petId, task }
//   - 'pet:show-bubble'      -> { petId, show }

type Listener<T = unknown> = (payload: T) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on<T = unknown>(event: string, listener: Listener<T>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener);
    return () => this.off(event, listener);
  }

  off<T = unknown>(event: string, listener: Listener<T>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener as Listener);
  }

  emit<T = unknown>(event: string, payload: T): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        // Não quebra outros listeners se um falhar.
        // eslint-disable-next-line no-console
        console.error(`[localEvents] Erro no listener de "${event}"`, err);
      }
    }
  }
}

export const localEvents = new EventBus();
