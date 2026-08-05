import { generateHooks } from "../_shared/hooks.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twitch';
const GQL_URL = 'https://gql.twitch.tv/gql';
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

type Channel = {
  login: string;
  displayName: string;
  description: string;
  profileImageUrl: string;
  broadcasterType: string;
  createdAt: string;
  followers: number | null;
  liveTitle: string | null;
  liveGame: string | null;
  liveViewers: number | null;
  lastGame: string | null;
  vods: { createdAt: string; viewCount: number }[];
};

/** Public Twitch GQL — works without OAuth, so the analyzer never dies on token issues. */
async function fetchViaGql(username: string): Promise<Channel | null> {
  const query = `query{user(login:"${username.replace(/["\\]/g, '')}"){id login displayName description profileImageURL(width:300) createdAt roles{isPartner isAffiliate} followers{totalCount} stream{title viewersCount game{name}} lastBroadcast{game{name}} videos(first:10,type:ARCHIVE){edges{node{createdAt viewCount}}}}}`;
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Client-Id': GQL_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Twitch public API failed [${res.status}]`);
  const json = await res.json();
  const u = json?.data?.user;
  if (!u) return null;
  return {
    login: u.login,
    displayName: u.displayName || u.login,
    description: u.description || '',
    profileImageUrl: u.profileImageURL || '',
    broadcasterType: u.roles?.isPartner ? 'partner' : u.roles?.isAffiliate ? 'affiliate' : '',
    createdAt: u.createdAt || '',
    followers: u.followers?.totalCount ?? null,
    liveTitle: u.stream?.title ?? null,
    liveGame: u.stream?.game?.name ?? null,
    liveViewers: u.stream?.viewersCount ?? null,
    lastGame: u.lastBroadcast?.game?.name ?? null,
    vods: (u.videos?.edges || []).map((e: any) => ({ createdAt: e.node?.createdAt, viewCount: e.node?.viewCount || 0 })),
  };
}

/** Helix through the Lovable connector — richer data when the connection is healthy. */
async function fetchViaGateway(username: string): Promise<Channel | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWITCH_API_KEY = Deno.env.get('TWITCH_API_KEY');
  if (!LOVABLE_API_KEY || !TWITCH_API_KEY) return null;
  const headers = { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': TWITCH_API_KEY };

  const userRes = await fetch(`${GATEWAY_URL}/users?login=${encodeURIComponent(username)}`, { headers });
  if (!userRes.ok) { await userRes.body?.cancel(); return null; }
  const userData = await userRes.json();
  const user = userData.data?.[0];
  if (!user) return null;

  const [streamRes, channelRes, vodRes, followerRes] = await Promise.all([
    fetch(`${GATEWAY_URL}/streams?user_login=${encodeURIComponent(username)}`, { headers }),
    fetch(`${GATEWAY_URL}/channels?broadcaster_id=${user.id}`, { headers }),
    fetch(`${GATEWAY_URL}/videos?user_id=${user.id}&first=10&type=archive`, { headers }),
    fetch(`${GATEWAY_URL}/channels/followers?broadcaster_id=${user.id}&first=1`, { headers }),
  ]);

  const stream = streamRes.ok ? (await streamRes.json()).data?.[0] || null : null;
  const channel = channelRes.ok ? (await channelRes.json()).data?.[0] || null : null;
  const vods = vodRes.ok ? ((await vodRes.json()).data || []) : [];
  let followers: number | null = null;
  if (followerRes.ok) followers = (await followerRes.json()).total ?? null;

  return {
    login: user.login,
    displayName: user.display_name,
    description: user.description || '',
    profileImageUrl: user.profile_image_url || '',
    broadcasterType: user.broadcaster_type || '',
    createdAt: user.created_at || '',
    followers,
    liveTitle: stream?.title ?? null,
    liveGame: stream?.game_name ?? null,
    liveViewers: stream?.viewer_count ?? null,
    lastGame: channel?.game_name ?? null,
    vods: vods.map((v: any) => ({ createdAt: v.created_at, viewCount: v.view_count || 0 })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { username } = await req.json();
    if (!username) {
      return new Response(JSON.stringify({ error: 'Username is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let channel: Channel | null = null;
    try {
      channel = await fetchViaGateway(username);
    } catch (e) {
      console.log('Gateway path failed, using public API:', e);
    }
    if (!channel) channel = await fetchViaGql(username);

    if (!channel) {
      return new Response(JSON.stringify({ error: 'Channel not found. Please check the link and try again.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isLive = channel.liveViewers !== null;
    const avgViewers = calculateAvgViewers(channel);
    const frequency = estimateFrequency(channel.vods);
    const growthStage = determineGrowthStage(channel.broadcasterType, channel.followers, avgViewers);
    const followersEstimate = channel.followers !== null
      ? channel.followers.toLocaleString()
      : estimateFollowers(channel.broadcasterType, avgViewers);
    const category = channel.liveGame || channel.lastGame || 'Variety';

    const strengths = generateStrengths(channel, avgViewers, frequency, isLive);
    const weaknesses = generateWeaknesses(channel, avgViewers, frequency);
    const opportunities = generateOpportunities(avgViewers, growthStage);
    const promotionPotential = generatePromotionPotential(growthStage, avgViewers, frequency);

    const hooks = await generateHooks({
      displayName: channel.displayName,
      platform: 'Twitch',
      category,
      followers: followersEstimate,
      avgViewers: avgViewers !== null ? `~${avgViewers}` : 'unknown',
      frequency,
      growthStage,
      isLive,
      liveTitle: channel.liveTitle,
      description: channel.description,
      strengths,
      weaknesses,
      opportunities,
    });

    const analysis = {
      username: channel.login,
      displayName: channel.displayName,
      description: channel.description,
      profileImageUrl: channel.profileImageUrl,
      broadcasterType: channel.broadcasterType,
      createdAt: channel.createdAt,
      platform: 'twitch',
      contentCategory: category,
      followersEstimate,
      avgViewers: avgViewers !== null ? `~${avgViewers}` : 'Unknown',
      streamingFrequency: frequency,
      growthStage,
      strengths,
      weaknesses,
      opportunities,
      promotionPotential,
      auditSummary: hooks.auditSummary,
      friendMessage: hooks.friendMessage,
      promoterMessage: hooks.promoterMessage,
      streamerMessage: hooks.streamerMessage,
      isLive,
      liveTitle: channel.liveTitle,
      liveGame: channel.liveGame,
      liveViewers: channel.liveViewers,
    };

    return new Response(JSON.stringify(analysis), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Analyze error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('429') ? 429 : 500;
    return new Response(JSON.stringify({ error: status === 429 ? 'Rate limited by Twitch. Please wait a moment and try again.' : msg }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateAvgViewers(channel: Channel): number | null {
  if (channel.liveViewers !== null) return channel.liveViewers;
  if (channel.vods.length === 0) return null;
  const total = channel.vods.reduce((sum, v) => sum + (v.viewCount || 0), 0);
  return Math.round(total / channel.vods.length);
}

function estimateFrequency(vods: { createdAt: string }[]): string {
  if (vods.length === 0) return 'Unknown';
  if (vods.length < 2) return 'Rarely';
  const dates = vods.map((v) => new Date(v.createdAt).getTime()).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  if (dates.length < 2) return 'Rarely';
  const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
  if (spanDays === 0) return '~Daily';
  const perWeek = (dates.length / spanDays) * 7;
  if (perWeek >= 5) return '~Daily (5+ times/week)';
  if (perWeek >= 3) return '3-4 times per week';
  if (perWeek >= 1.5) return '~2 times per week';
  if (perWeek >= 0.8) return '~Weekly';
  return 'Infrequent';
}

function determineGrowthStage(broadcasterType: string, followers: number | null, avgViewers: number | null): string {
  if (followers !== null && followers > 100000) return 'Established Creator';
  if (broadcasterType === 'partner') return 'Partner';
  if (broadcasterType === 'affiliate') return 'Affiliate';
  if (followers !== null && followers > 500) return 'Growing Creator';
  if (avgViewers !== null && avgViewers > 10) return 'Small Creator';
  return 'New Streamer';
}

function estimateFollowers(broadcasterType: string, avgViewers: number | null): string {
  if (broadcasterType === 'partner') return '10,000+ (Partner)';
  if (broadcasterType === 'affiliate') return '~50-5,000 (Affiliate)';
  if (avgViewers !== null && avgViewers > 50) return '~1,000-5,000 (estimated)';
  if (avgViewers !== null && avgViewers > 10) return '~200-1,000 (estimated)';
  return '< 200 (estimated)';
}

function generateStrengths(channel: Channel, avgViewers: number | null, frequency: string, isLive: boolean): string[] {
  const s: string[] = [];
  if (channel.broadcasterType === 'partner') s.push('Twitch Partner — established credibility');
  if (channel.broadcasterType === 'affiliate') s.push('Achieved Affiliate status');
  if (channel.followers && channel.followers > 1000) s.push(`Solid follower base (${channel.followers.toLocaleString()})`);
  if (channel.vods.length >= 5) s.push('Active content library with recent VODs');
  if (frequency.includes('Daily') || frequency.includes('3-4')) s.push('Consistent streaming schedule');
  if (isLive) s.push(`Currently live with ${channel.liveViewers} viewers`);
  if (avgViewers && avgViewers > 20) s.push('Solid average viewership per stream');
  if (channel.description && channel.description.length > 50) s.push('Well-written channel description');
  if (s.length === 0) s.push('Starting their streaming journey — high growth potential');
  return s;
}

function generateWeaknesses(channel: Channel, avgViewers: number | null, frequency: string): string[] {
  const w: string[] = [];
  if (avgViewers !== null && avgViewers < 10) w.push('Low average viewership — limited discoverability');
  if (channel.vods.length < 3) w.push('Few recent VODs — content is not being repurposed');
  if (frequency === 'Infrequent' || frequency === 'Unknown' || frequency === 'Rarely') w.push('Irregular streaming schedule');
  if (!channel.description || channel.description.length < 20) w.push('Minimal channel description — weak first impression');
  if (channel.broadcasterType === '') w.push('Not yet Affiliate — missing monetization features');
  if (w.length === 0) w.push('No major weaknesses — growth is mostly a reach problem');
  return w;
}

function generateOpportunities(avgViewers: number | null, growthStage: string): string[] {
  const o: string[] = ['Clip-based content for TikTok and YouTube Shorts'];
  if (growthStage === 'New Streamer' || growthStage === 'Small Creator') {
    o.push('Raid/host exchange with similar-sized streamers');
    o.push('Community events to boost engagement metrics');
  }
  if (avgViewers !== null && avgViewers < 50) o.push('Targeted promotion to increase discoverability');
  o.push('Cross-platform social media presence');
  return o;
}

function generatePromotionPotential(growthStage: string, avgViewers: number | null, frequency: string): string {
  const consistent = frequency.includes('Daily') || frequency.includes('3-4') || frequency.includes('Weekly');
  if (growthStage === 'Partner' || growthStage === 'Established Creator') {
    return 'Moderate — already established, but promotion could expand them into new audiences and boost subscriber growth.';
  }
  if (consistent && (avgViewers === null || avgViewers < 50)) {
    return 'High — the consistency is there but the audience growth strategy is missing. Promotion could sharply accelerate them.';
  }
  if (!consistent) {
    return 'Medium — needs a more consistent schedule first, but promotion could provide the results that motivate that commitment.';
  }
  return 'Good — solid foundation in place. Strategic promotion could push them past their current plateau.';
}
