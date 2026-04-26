export type UserNotificationType = 'match_finished' | 'team_event';

export type UserNotification = {
    id: string;
    user_id: string;
    type: UserNotificationType;
    title: string;
    body: string;
    entity_type: 'match' | 'club' | 'tournament';
    entity_id: string;
    match_id: string | null;
    club_id: string | null;
    tournament_id: string | null;
    event_id: string | null;
    metadata: Record<string, unknown>;
    read_at: string | null;
    created_at: string;
};

export type NotificationsApiResponse = {
    notifications: UserNotification[];
    unreadCount: number;
    schemaReady: boolean;
};
