const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twitch';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const TWITCH_API_KEY = Deno.env.get('TWITCH_API_KEY');
  if (!TWITCH_API_KEY) {
    return new Response(JSON.stringify({ error: 'TWITCH_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const gatewayHeaders = {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'X-Connection-Api-Key': TWITCH_API_KEY,
  };

  try {
    const { username } = await req.json();
    if (!username) {
      return new Response(JSON.stringify({ error: 'Username is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Get user info
    const userRes = await fetch(`${GATEWAY_URL}/users?login=${encodeURIComponent(username)}`, {
      headers: gatewayHeaders,
    });
    if (!userRes.ok) {
      const errBody = await userRes.text();
      throw new Error(`Twitch users API failed [${userRes.status}]: ${errBody}`);
    }
    const userData = await userRes.json();
    if (!userData.data || userData.data.length === 0) {
      return new Response(JSON.stringify({ error: 'Channel not found. Please check the username and try again.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = userData.data[0];

    // 2. Get stream info (if live)
    const streamRes = await fetch(`${GATEWAY_URL}/streams?user_login=${encodeURIComponent(username)}`, {
      headers: gatewayHeaders,
    });
    const streamData = await streamRes.json();
    const stream = streamData.data?.[0] || null;

    // 3. Get recent VODs
    const vodRes = await fetch(`${GATEWAY_URL}/videos?user_id=${user.id}&first=10&type=archive`, {
      headers: gatewayHeaders,
    });
    const vodData = await vodRes.json();
    const vods = vodData.data || [];

    // 4. Try to get follower count
    let followerCount: number | null = null;
    try {
      const followerRes = await fetch(`${GATEWAY_URL}/channels/followers?broadcaster_id=${user.id}&first=1`, {
        headers: gatewayHeaders,
      });
      if (followerRes.ok) {
        const followerData = await followerRes.json();
        followerCount = followerData.total ?? null;
      }
    } catch {
      // Follower endpoint may fail without proper scope — that's ok
    }

    // Calculate metrics
    const avgViewers = calculateAvgViewers(vods, stream);
    const frequency = estimateFrequency(vods, user.created_at);
    const growthStage = determineGrowthStage(user.broadcaster_type, followerCount, avgViewers);
    const followersEstimate = followerCount !== null
      ? followerCount.toLocaleString()
      : estimateFollowers(user.broadcaster_type, avgViewers);

    const strengths = generateStrengths(user, vods, stream, avgViewers, frequency);
    const weaknesses = generateWeaknesses(user, vods, avgViewers, frequency);
    const opportunities = generateOpportunities(user, vods, avgViewers, growthStage);
    const promotionPotential = generatePromotionPotential(growthStage, avgViewers, frequency);
    const friendMessage = generateFriendMessage(user.display_name, growthStage, stream);
    const promoterMessage = generatePromoterMessage(user.display_name, growthStage, avgViewers);

    const analysis = {
      username: user.login,
      displayName: user.display_name,
      description: user.description,
      profileImageUrl: user.profile_image_url,
      broadcasterType: user.broadcaster_type,
      createdAt: user.created_at,
      platform: 'twitch',
      followersEstimate: followersEstimate,
      avgViewers: avgViewers !== null ? `~${avgViewers}` : 'Unknown',
      streamingFrequency: frequency,
      growthStage,
      strengths,
      weaknesses,
      opportunities,
      promotionPotential,
      friendMessage,
      promoterMessage,
      isLive: !!stream,
      liveTitle: stream?.title || null,
      liveGame: stream?.game_name || null,
      liveViewers: stream?.viewer_count || null,
    };

    return new Response(JSON.stringify(analysis), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Analyze error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      return new Response(JSON.stringify({ error: 'Rate limited by Twitch. Please wait a moment and try again.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateAvgViewers(vods: any[], stream: any): number | null {
  if (stream) return stream.viewer_count;
  if (vods.length === 0) return null;
  const totalViews = vods.reduce((sum: number, v: any) => sum + (v.view_count || 0), 0);
  return Math.round(totalViews / vods.length);
}

function estimateFrequency(vods: any[], createdAt: string): string {
  if (vods.length === 0) return 'Unknown';
  if (vods.length < 2) return 'Rarely';

  const dates = vods.map((v: any) => new Date(v.created_at).getTime()).sort();
  const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
  if (spanDays === 0) return '~Daily';

  const perWeek = (vods.length / spanDays) * 7;
  if (perWeek >= 5) return '~Daily (5+ times/week)';
  if (perWeek >= 3) return '3-4 times per week';
  if (perWeek >= 1.5) return '~2 times per week';
  if (perWeek >= 0.8) return '~Weekly';
  return 'Infrequent';
}

function determineGrowthStage(broadcasterType: string, followers: number | null, avgViewers: number | null): string {
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

function generateStrengths(user: any, vods: any[], stream: any, avgViewers: number | null, frequency: string): string[] {
  const s: string[] = [];
  if (user.broadcaster_type === 'partner') s.push('Twitch Partner — established credibility');
  if (user.broadcaster_type === 'affiliate') s.push('Achieved Affiliate status');
  if (vods.length >= 5) s.push('Active content library with recent VODs');
  if (frequency.includes('Daily') || frequency.includes('3-4')) s.push('Consistent streaming schedule');
  if (stream) s.push(`Currently live with ${stream.viewer_count} viewers`);
  if (avgViewers && avgViewers > 20) s.push('Solid average viewership');
  if (user.description && user.description.length > 50) s.push('Well-written channel description');
  if (s.length === 0) s.push('Starting their streaming journey — high growth potential');
  return s;
}

function generateWeaknesses(user: any, vods: any[], avgViewers: number | null, frequency: string): string[] {
  const w: string[] = [];
  if (avgViewers !== null && avgViewers < 10) w.push('Low average viewership — limited discoverability');
  if (vods.length < 3) w.push('Few recent VODs — may need more consistent schedule');
  if (frequency === 'Infrequent' || frequency === 'Unknown') w.push('Irregular streaming schedule');
  if (!user.description || user.description.length < 20) w.push('Minimal channel description');
  if (user.broadcaster_type === '') w.push('Not yet Affiliate — missing monetization features');
  if (w.length === 0) w.push('No major weaknesses identified');
  return w;
}

function generateOpportunities(user: any, vods: any[], avgViewers: number | null, growthStage: string): string[] {
  const o: string[] = [];
  o.push('Clip-based content for TikTok and YouTube Shorts');
  if (growthStage === 'New Streamer' || growthStage === 'Small Creator') {
    o.push('Raid/host exchange with similar-sized streamers');
    o.push('Community events to boost engagement metrics');
  }
  if (avgViewers !== null && avgViewers < 50) {
    o.push('Targeted promotion to increase discoverability');
  }
  o.push('Cross-platform social media presence');
  return o;
}

function generatePromotionPotential(growthStage: string, avgViewers: number | null, frequency: string): string {
  const consistent = frequency.includes('Daily') || frequency.includes('3-4') || frequency.includes('Weekly');

  if (growthStage === 'Partner') {
    return 'Moderate — already established, but promotion could help expand into new audiences and boost subscriber growth.';
  }
  if (consistent && (avgViewers === null || avgViewers < 50)) {
    return 'High — this streamer has the consistency but lacks audience growth strategy. Promotion could significantly accelerate their path to the next level.';
  }
  if (!consistent) {
    return 'Medium — needs to establish a more consistent schedule first, but promotion could provide the motivation and results to commit more.';
  }
  return 'Good — solid foundation in place. Strategic promotion could push them past their current plateau.';
}

function generateFriendMessage(displayName: string, growthStage: string, stream: any): string {
  if (stream) {
    return `Hey ${displayName}! I just caught your stream playing ${stream.game_name || 'your game'} and your energy is really solid! How long have you been streaming? I feel like you're at that point where the right push could really change things for you 🔥`;
  }
  if (growthStage === 'New Streamer' || growthStage === 'Small Creator') {
    return `Hey ${displayName}! I came across your channel and honestly I can tell you're putting in the work. The grind as a smaller streamer is real — how's it been going for you? I feel like you've got something good building here 💪`;
  }
  return `Hey ${displayName}! Been checking out your channel and your content is really solid. How's the streaming journey been treating you lately? I'm always curious to hear what creators at your level are thinking about in terms of growth 🔥`;
}

function generatePromoterMessage(displayName: string, growthStage: string, avgViewers: number | null): string {
  const viewerNote = avgViewers !== null ? `averaging around ${avgViewers} viewers` : 'building your audience';

  if (growthStage === 'New Streamer' || growthStage === 'Small Creator') {
    return `Hi ${displayName}! I work with streamers in your stage of growth, and I noticed your channel has strong potential. You're ${viewerNote}, and the consistency is already there — what's often missing is discoverability. I'd love to chat about how we could get your stream in front of more eyes. Would you be open to a quick conversation?`;
  }
  return `Hi ${displayName}! I've been following your channel and I'm impressed by what you've built. You're ${viewerNote}, and I think with the right growth strategy, you could see a significant jump. I specialize in helping streamers like you break through to the next level. Would you be open to discussing some strategies?`;
}
