export type PlayerChip = {
    id: string;
    number: number;
    x: number;
    y: number;
    team: 'home' | 'away';
};

export type Point = {
    x: number;
    y: number;
};

export type LinePath = {
    id: string;
    points: Point[];
    color: string;
    width: number;
};

export type ArrowTargetType = 'player' | 'ball';

export type MovementArrow = {
    id: string;
    targetType: ArrowTargetType;
    targetId: string;
    points: Point[];
    color: string;
    width: number;
};

export type BallAnchor = {
    playerId: string;
    offsetX: number;
    offsetY: number;
};

export type BallState = {
    x: number;
    y: number;
    visible: boolean;
    anchor?: BallAnchor | null;
};

export type ViewBox = {
    x: number;
    y: number;
    w: number;
    h: number;
};

export type EasingPreset = 'linear' | 'easeInOut' | 'easeOut' | 'rugbyBurst';

export type TimelineFrame = {
    id: string;
    name: string;
    players: PlayerChip[];
    lines: LinePath[];
    ball: BallState;
    viewBox: ViewBox;
    arrows: MovementArrow[];
    duration: number;
    holdBefore: number;
    holdAfter: number;
    easing: EasingPreset;
};

export type RugbyPreset = {
    id: string;
    name: string;
    category: string;
    players: PlayerChip[];
    ball: BallState;
    lines: LinePath[];
    viewBox: ViewBox;
};

export type BoardMode = 'select' | 'draw' | 'arrow';
export type BoardOrientation = 'horizontal' | 'vertical';
export type PizarraUIMode = 'edit' | 'animate' | 'config';

export type SavedPreset = {
    id: string;
    name: string;
    category: string;
    boardState: PersistedBoardState;
    createdAt: number;
    updatedAt: number;
};

export type TimelineSegment = {
    id: string;
    fromFrame: TimelineFrame;
    toFrame: TimelineFrame;
    segmentIndex: number;
    holdStart: number;
    motionStart: number;
    motionEnd: number;
    segmentEnd: number;
    duration: number;
    easing: EasingPreset;
};

export type ResolvedPlayerState = PlayerChip & {
    opacity: number;
};

export type ResolvedBallState = BallState & {
    opacity: number;
};

export type ResolvedLineLayer = {
    id: string;
    lines: LinePath[];
    opacity: number;
};

export type ResolvedArrowLayer = {
    id: string;
    arrows: MovementArrow[];
    opacity: number;
};

export type ResolvedBoardState = {
    players: ResolvedPlayerState[];
    ball: ResolvedBallState;
    viewBox: ViewBox;
    lineLayers: ResolvedLineLayer[];
    arrowLayers: ResolvedArrowLayer[];
    activeSegmentIndex: number;
    focusFrameIndex: number;
    localProgress: number;
};

export type PersistedBoardState = {
    version: number;
    players: PlayerChip[];
    lines: LinePath[];
    ball: BallState;
    viewBox: ViewBox;
    timeline: TimelineFrame[];
    showNumbers: boolean;
    mode: BoardMode;
    orientation: BoardOrientation;
    lineColor: string;
    lineWidth: number;
    playbackSpeed: number;
};
