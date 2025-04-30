// Type definitions for Service Worker
interface ServiceWorkerGlobalScope {
  skipWaiting(): Promise<void>;
  clients: Clients;
  registration: ServiceWorkerRegistration;
}

interface Clients {
  claim(): Promise<void>;
  get(id: string): Promise<Client | undefined>;
  matchAll(options?: ClientQueryOptions): Promise<Client[]>;
}

interface ClientQueryOptions {
  includeUncontrolled?: boolean;
  type?: ClientType;
}

type ClientType = "window" | "worker" | "sharedworker" | "all";

interface Client {
  id: string;
  type: ClientType;
  url: string;
  postMessage(message: any, transfer?: Transferable[]): void;
}

interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
  clientId: string;
  resultingClientId: string;
}

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<any>): void;
}

interface ExtendableMessageEvent extends ExtendableEvent {
  data: any;
  origin: string;
  lastEventId: string;
  source: Client | ServiceWorker | MessagePort | null;
  ports: ReadonlyArray<MessagePort>;
}
