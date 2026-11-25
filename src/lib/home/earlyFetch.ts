// Pedidos de la home que arrancan ANTES de que hidrate React.
//
// La home es un componente de cliente: sin esto, cada pedido de datos sale
// recién cuando terminó de bajar y ejecutarse el JS (medido en prod: 2,6 s en
// escritorio, 3,4 s en un celular), aunque el servidor conteste en 0,1-0,7 s.
//
// `HOME_EARLY_FETCH_SCRIPT` va inline en el <head> del layout y solo actúa en
// "/": dispara los pedidos y deja cada promesa en `window.__g22Early` con la URL
// EXACTA como clave. El código de la home los toma con `earlyFetch(url)`; si la
// URL no coincide (otro deporte por login, otra fecha) no pasa nada: sale un
// fetch normal. Cada respuesta se consume UNA vez, porque un body no se puede
// leer dos veces.

declare global {
    interface Window {
        __g22Early?: Record<string, Promise<Response>>;
    }
}

/**
 * Tiene que armar las URLs EXACTAMENTE como las arma el cliente:
 * - partidos: `useMatchesStore.fetchDate` (fecha local en la zona del navegador,
 *   formateada como `formatDateKey`, y la zona cruda de `Intl`).
 * - deporte: `?sport=` > `g22:device-sport` (deviceSportPreference) > rugby,
 *   el mismo orden que SportContext para un visitante sin login.
 * El tenis no pasa por el feed genérico, así que no se le pide nada.
 */
export const HOME_EARLY_FETCH_SCRIPT = `(function(){try{
if(location.pathname!=='/'||!window.fetch)return;
var e=window.__g22Early={};
function go(u){e[u]=fetch(u);e[u].catch(function(){});}
var sport=new URLSearchParams(location.search).get('sport');
if(!sport){try{var r=JSON.parse(localStorage.getItem('g22:device-sport')||'null');if(r&&typeof r.sportId==='string')sport=r.sportId;}catch(_){}}
if(!sport||!/^[a-z-]+$/.test(sport))sport='rugby';
var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
var date=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(sport!=='tennis')go('/api/matches?date='+date+'&sport='+sport+'&external=true&tz='+encodeURIComponent(tz));
if(sport==='rugby')go('/api/public/tournaments?sport=rugby&scope=summary');
go('/api/news');
go('/api/public/unions');
go('/api/home/manual-tournaments');
go('/api/xv-ideal/open');
}catch(_){}})();`;

function takeEarly(url: string): Promise<Response> | null {
    if (typeof window === 'undefined') return null;
    const store = window.__g22Early;
    const pending = store?.[url];
    if (!pending) return null;
    delete store![url];
    return pending;
}

/** La promesa se corta con el signal aunque el fetch de abajo no lo escuche. */
function withSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
            (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
        );
    });
}

/**
 * `fetch` que primero aprovecha el pedido adelantado de la misma URL. Si el
 * adelantado falló por red, cae a un fetch normal en vez de propagar el error.
 */
export function earlyFetch(url: string, init?: RequestInit): Promise<Response> {
    const early = takeEarly(url);
    if (!early) return fetch(url, init);
    return withSignal(
        early.catch(() => fetch(url, init)),
        init?.signal,
    );
}

const SHARED_TTL_MS = 30_000;
const shared = new Map<string, { at: number; promise: Promise<unknown> }>();

/**
 * JSON de una URL compartido entre componentes de la misma página: la home y
 * el ticker de titulares piden `/api/news`, y el acceso al XV Ideal se monta dos
 * veces (feed y sidebar). Era un pedido duplicado por visita cada uno.
 * Un error no se memoriza: el próximo que lo pida vuelve a intentar.
 */
export function sharedJson<T = unknown>(url: string): Promise<T> {
    const hit = shared.get(url);
    if (hit && Date.now() - hit.at < SHARED_TTL_MS) return hit.promise as Promise<T>;

    const promise = earlyFetch(url).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as T;
    });
    promise.catch(() => {
        if (shared.get(url)?.promise === promise) shared.delete(url);
    });
    shared.set(url, { at: Date.now(), promise });
    return promise;
}
