'use client';

import { Settings2, History } from 'lucide-react';

export function StandingsBottomModules({
  onRecalculate,
  isRecalculating
}: {
  onRecalculate: () => void;
  isRecalculating: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      
      {/* Calculation Mode Module */}
      <div className="bg-[rgba(20,20,20,0.5)] border border-[rgba(255,255,255,0.05)] rounded-lg p-6 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-xs font-semibold text-white tracking-wide uppercase flex items-center gap-2 mb-4">
            <Settings2 className="w-4 h-4 text-[rgba(255,255,255,0.5)]" />
            Modo de Cálculo
          </h3>
          <p className="text-xs text-[rgba(255,255,255,0.7)] leading-relaxed mb-6">
            La tabla de posiciones se calcula actualmente de manera <strong className="text-white font-bold bg-[rgba(255,255,255,0.05)] px-1 rounded">Automática</strong> basándose en los resultados finales de los partidos y las reglas de torneo definidas. 
            Las sobrescrituras manuales se aplican donde han sido configuradas.
          </p>
        </div>
        
        <div className="flex flex-wrap justify-end gap-3 mt-4">
          <button className="px-4 py-2 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-md text-xs font-mono uppercase tracking-widest text-[#00E5FF] hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-50">
            Configurar Lógica
          </button>
          <button 
            onClick={onRecalculate}
            disabled={isRecalculating}
            className="px-4 py-2 bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] rounded-md text-xs font-mono font-bold tracking-widest uppercase hover:bg-[#CCFF00] hover:text-black transition-colors disabled:opacity-50 flex items-center gap-2 shadow-[0_0_10px_rgba(204,255,0,0.1)]"
          >
            {isRecalculating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Recalculando...
              </>
            ) : (
              'Forzar Recálculo'
            )}
          </button>
        </div>
      </div>

      {/* Change History Module */}
      <div className="bg-[rgba(20,20,20,0.5)] border border-[rgba(255,255,255,0.05)] rounded-lg p-6 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-xs font-semibold text-white tracking-wide uppercase flex items-center gap-2 mb-5">
            <History className="w-4 h-4 text-[rgba(255,255,255,0.5)]" />
            Log de Auditoría Reciente
          </h3>
          
          <div className="space-y-4">
            <div className="flex flex-col gap-1 pb-4 border-b border-[rgba(255,255,255,0.05)]">
               <div className="flex justify-between items-center text-sm">
                  <span className="text-[#CCFF00] font-mono text-[10px] tracking-widest uppercase">RECALCULATED_STANDINGS</span>
                  <span className="text-[rgba(255,255,255,0.4)] text-[10px] font-mono uppercase">Hoy, 14:30</span>
               </div>
               <div className="text-xs text-[rgba(255,255,255,0.7)] mt-1">Cálculo automático del sistema para Fase 1</div>
            </div>
            <div className="flex flex-col gap-1 pb-4 border-b border-[rgba(255,255,255,0.05)]">
               <div className="flex justify-between items-center text-sm">
                  <span className="text-[#00E5FF] font-mono text-[10px] tracking-widest uppercase">UPDATED_RULES</span>
                  <span className="text-[rgba(255,255,255,0.4)] text-[10px] font-mono uppercase">Ayer, 09:15</span>
               </div>
               <div className="text-xs text-[rgba(255,255,255,0.7)] mt-1">Administrador ajustó regla de puntos por bonus ofensivo</div>
            </div>
          </div>
        </div>
        
        <div className="mt-2 text-right">
          <button className="text-[10px] font-mono tracking-widest uppercase text-[#00E5FF] hover:text-white mt-4 inline-block transition-colors decoration-dashed underline underline-offset-4">
            Ver log completo
          </button>
        </div>
      </div>

    </div>
  );
}
