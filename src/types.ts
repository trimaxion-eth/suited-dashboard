export type DayRake = {
  date: string;
  checkpoints: number;
  rake_usdg: number;
  cumulative_usdg: number;
};

export type DayFees = {
  date: string;
  credited: number;
  claimed_in: number;
  forwarded: number;
  split: number;
  house: number;
  jackpot: number;
  stakers: number;
  tournaments: number;
  buyback: number;
  cumulative_credited_usdg: number;
};

export type HistoryPoint = {
  at: string;
  price: number | null;
  fdv: number | null;
  liq: number | null;
  holders: number | null;
  staked: number | null;
  burnt: number | null;
  hands: number | null;
  players: number | null;
  seated: number | null;
  in_play: number | null;
  vault: number | null;
  discord_members: number | null;
};

export type SocialEngagement = {
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  total: number;
  score: number;
};

export type SocialXMember = {
  id?: string | null;
  handle: string | null;
  name: string | null;
  verified: boolean;
  url: string | null;
  description?: string | null;
  bio?: string | null;
  created_at?: string | null;
  account_age_days?: number | null;
  followers?: number | null;
  engagement?: SocialEngagement;
};

export type Social = {
  generated_at: string;
  x: {
    handle: string;
    captured_at?: string | null;
    followers_reported?: number | null;
    count: number;
    verified_count: number;
    counted: number;
    members: SocialXMember[];
    notable: SocialXMember[];
    engaged: SocialXMember[];
    by_created_year: { year: number; count: number }[];
    engagement: {
      collected: boolean;
      collected_at?: string | null;
      posts: number;
      accounts: number;
      top_posts: unknown[];
    };
  };
  discord: {
    guild: string;
    captured_at?: string | null;
    member_count: number;
    humans: number;
    bots: number;
    premium_tier?: number | null;
    role_counts: { name: string; count: number; id: string }[];
    joins_by_day: { date: string; count: number }[];
    joins_by_week: { week: string; count: number }[];
    joined: { username: string; global_name?: string | null; joined_at: string; bot: boolean }[];
    engagement: {
      scans: number;
      first_scan?: string | null;
      last_scan?: string | null;
      sampled_messages: number;
      top: {
        author: string;
        messages: number;
        channels: string[];
        channel_count: number;
        last?: string | null;
      }[];
      top_channels: { name: string; messages: number }[];
    };
  };
} | null;

export type Snapshot = {
  generated_at: string;
  error?: string;
  sources?: string[];
  live: {
    stats?: Record<string, unknown>;
    staking?: Record<string, unknown>;
    leaderboard?: Record<string, unknown>;
    tournaments?: Record<string, unknown>;
  };
  track: Record<string, unknown> | null;
  history: HistoryPoint[];
  rake: {
    generated_at: string;
    total_rake_usdg: number;
    prelaunch?: { rake_usdg: number };
    daily: DayRake[];
  } | null;
  creator_fees: {
    generated_at: string;
    totals: Record<string, number>;
    live_state?: Record<string, number>;
    daily: DayFees[];
  } | null;
  staking_funded: {
    generated_at: string;
    total_added_usdg: number;
    daily: { date: string; added_usdg: number }[];
  } | null;
  social?: Social;
};
