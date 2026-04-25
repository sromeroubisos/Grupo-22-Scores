import { FIELD_PAD, FIELD_W, FIELD_H, SVG_W, SVG_H } from '@/lib/club-pizarra/constants';

export function RugbyField() {
    const x0 = FIELD_PAD.x;
    const y0 = FIELD_PAD.y;
    const x1 = x0 + FIELD_W;
    const y1 = y0 + FIELD_H;
    const inGoalDepth = 110;
    const tryLineTop = y0 + inGoalDepth;
    const tryLineBottom = y1 - inGoalDepth;
    const fieldOfPlayHeight = tryLineBottom - tryLineTop;
    const line22Top = tryLineTop + fieldOfPlayHeight * 0.22;
    const line22Bottom = tryLineBottom - fieldOfPlayHeight * 0.22;
    const halfway = y0 + FIELD_H / 2;
    const line10Top = halfway - fieldOfPlayHeight * 0.1;
    const line10Bottom = halfway + fieldOfPlayHeight * 0.1;
    const touch5Left = x0 + FIELD_W * (5 / 70);
    const touch15Left = x0 + FIELD_W * (15 / 70);
    const touch15Right = x1 - FIELD_W * (15 / 70);
    const touch5Right = x1 - FIELD_W * (5 / 70);
    const intersectionYs = [line22Top, line10Top, halfway, line10Bottom, line22Bottom];
    const intersectionXs = [touch5Left, touch15Left, touch15Right, touch5Right];
    const postGap = 26;
    const postTop = tryLineTop - 38;
    const postBottom = tryLineBottom + 38;
    const stroke = 2.2;
    const dashStroke = 1.8;
    const markerSize = 7;

    return (
        <g>
            <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="#06110a" rx="28" />
            <rect x={x0} y={y0} width={FIELD_W} height={FIELD_H} rx="24" fill="#168842" />
            <rect x={x0} y={y0} width={FIELD_W} height={inGoalDepth} fill="#13773a" rx="24" />
            <rect x={x0} y={tryLineBottom} width={FIELD_W} height={inGoalDepth} fill="#13773a" rx="24" />
            <rect x={x0} y={y0} width={FIELD_W} height={FIELD_H} rx="24" fill="none" stroke="#ffffff" strokeWidth={stroke} />

            <line x1={x0} y1={tryLineTop} x2={x1} y2={tryLineTop} stroke="#ffffff" strokeWidth={stroke} />
            <line x1={x0} y1={tryLineBottom} x2={x1} y2={tryLineBottom} stroke="#ffffff" strokeWidth={stroke} />
            <line x1={x0} y1={line22Top} x2={x1} y2={line22Top} stroke="#ffffff" strokeWidth={stroke} />
            <line x1={x0} y1={line22Bottom} x2={x1} y2={line22Bottom} stroke="#ffffff" strokeWidth={stroke} />
            <line x1={x0} y1={halfway} x2={x1} y2={halfway} stroke="#ffffff" strokeWidth={stroke} />

            <line x1={x0} y1={line10Top} x2={x1} y2={line10Top} stroke="#ffffff" strokeWidth={dashStroke} strokeDasharray="12 10" />
            <line x1={x0} y1={line10Bottom} x2={x1} y2={line10Bottom} stroke="#ffffff" strokeWidth={dashStroke} strokeDasharray="12 10" />

            <line x1={touch5Left} y1={tryLineTop} x2={touch5Left} y2={tryLineBottom} stroke="#ffffff" strokeWidth={dashStroke} strokeDasharray="10 10" />
            <line x1={touch15Left} y1={tryLineTop} x2={touch15Left} y2={tryLineBottom} stroke="#ffffff" strokeWidth={dashStroke} strokeDasharray="10 10" />
            <line x1={touch15Right} y1={tryLineTop} x2={touch15Right} y2={tryLineBottom} stroke="#ffffff" strokeWidth={dashStroke} strokeDasharray="10 10" />
            <line x1={touch5Right} y1={tryLineTop} x2={touch5Right} y2={tryLineBottom} stroke="#ffffff" strokeWidth={dashStroke} strokeDasharray="10 10" />

            {intersectionXs.flatMap((x) =>
                intersectionYs.map((y) => (
                    <g key={`${x}-${y}`}>
                        <line x1={x - markerSize} y1={y} x2={x + markerSize} y2={y} stroke="#ffffff" strokeWidth="1.4" />
                        <line x1={x} y1={y - markerSize} x2={x} y2={y + markerSize} stroke="#ffffff" strokeWidth="1.4" />
                    </g>
                ))
            )}

            <line x1={x0 + FIELD_W / 2 - postGap} y1={postTop} x2={x0 + FIELD_W / 2 - postGap} y2={tryLineTop + 12} stroke="#ffffff" strokeWidth="4" />
            <line x1={x0 + FIELD_W / 2 + postGap} y1={postTop} x2={x0 + FIELD_W / 2 + postGap} y2={tryLineTop + 12} stroke="#ffffff" strokeWidth="4" />
            <line x1={x0 + FIELD_W / 2 - postGap} y1={tryLineTop - 10} x2={x0 + FIELD_W / 2 + postGap} y2={tryLineTop - 10} stroke="#ffffff" strokeWidth="4" />

            <line x1={x0 + FIELD_W / 2 - postGap} y1={tryLineBottom - 12} x2={x0 + FIELD_W / 2 - postGap} y2={postBottom} stroke="#ffffff" strokeWidth="4" />
            <line x1={x0 + FIELD_W / 2 + postGap} y1={tryLineBottom - 12} x2={x0 + FIELD_W / 2 + postGap} y2={postBottom} stroke="#ffffff" strokeWidth="4" />
            <line x1={x0 + FIELD_W / 2 - postGap} y1={tryLineBottom + 10} x2={x0 + FIELD_W / 2 + postGap} y2={tryLineBottom + 10} stroke="#ffffff" strokeWidth="4" />
        </g>
    );
}
