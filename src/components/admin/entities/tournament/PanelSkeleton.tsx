'use client';

/**
 * Esqueleto con la forma de lo que viene, no un spinner centrado. El armazón
 * ya está en pantalla: lo único que falta son los datos, así que se dibujan
 * los huecos que van a ocupar y la página no salta cuando llegan.
 *
 * Vive en su propio módulo —y no adentro de `TournamentOperationTab`— porque lo
 * usan los dos lados: la consola mientras carga un subtab, y cada subtab en su
 * primera carga. Importarlo desde el tab crearía un ciclo, porque la consola ya
 * importa los subtabs de forma dinámica.
 */
export function PanelSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="op-panel" aria-busy="true" aria-live="polite">
            <div className="op-panel-head">
                <span className="op-skeleton" style={{ width: 120 }} />
            </div>
            <div className="op-panel-body is-flush">
                {Array.from({ length: rows }).map((_, index) => (
                    <div className="op-match-row" key={index}>
                        <span className="op-skeleton" style={{ width: 92 }} />
                        <span className="op-skeleton op-skeleton-crest" />
                        <span className="op-skeleton" style={{ flex: 1 }} />
                        <span className="op-skeleton" style={{ width: 52 }} />
                    </div>
                ))}
            </div>
            <span className="sr-only">Cargando…</span>
        </div>
    );
}
