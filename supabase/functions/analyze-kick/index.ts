const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const KICK_API = 'https://kick.com/api/v2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username } = await req.json();
    if (!username) {
      return new Response(JSON.stringify({ error: 'Username is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch channel data from Kick's public API
    const channelRes = await fetch(`${KICK_API}/channels/${encodeURIComponent(username)}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!channelRes.ok) {
      if (channelRes.status === 404) {
        return new Response(JSON.stringify({ error: 'Channel not found on Kick. Please check the username and try again.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Kick API failed [${channelRes.status}]: ${await channelRes.text()}`);
    }

    const channel = await channelRes.json();

    const user = channel.user || {};
    const livestream = channel.livestream || null;
    const recentCategories = channel.recent_categories || [];
    const followers = channel.followersCount ?? channel.followers_count ?? null;
    const isVerified = channel.verified ?? false;
    const isLive = !!livestream;

    // Extract profile info
    const displayName = user.username || channel.slug || username;
    const description = channel.user?.bio || '';
    const profileImageUrl = user.profile_pic || channel.user?.profilepic || '';
    const createdAt = user.created_at || '';

    // Determine broadcaster type equivalent
    const broadcasterType = isVerified ? 'verified' : (followers && followers > 1000 ? 'established' : '');

    // Calculate metrics from available data
    const avgViewers = livestream ? livestream.viewer_count : (channel.previous_live_streams ? estimateAvgViewersFromHistory(channel) : null);
    const frequency = estimateFrequency(channel);
    const growthStage = determineGrowthStage(broadcasterType, followers, avgViewers);
    const followersEstimate = followers !== null ? followers.toLocaleString() : estimateFollowers(broadcasterType, avgViewers);

    const strengths = generateStrengths(channel, displayName, isLive, livestream, avgViewers, frequency, followers);
    const weaknesses = generateWeaknesses(channel, avgViewers, frequency, followers);
    const opportunities = generateOpportunities(avgViewers, growthStage);
    const promotionPotential = generatePromotionPotential(growthStage, avgViewers, frequency);
    const friendMessage = generateFriendMessage(displayName, growthStage, livestream);
    const promoterMessage = generatePromoterMessage(displayName, growthStage, avgViewers);

    const analysis = {
      username: channel.slug || username,
      displayName,
      description,
      profileImageUrl,
      broadcasterType,
      createdAt,
      platform: 'kick',
      contentCategory: livestream?.categories?.[0]?.name || recentCategories?.[0]?.name || 'Variety',
      followersEstimate,
      avgViewers: avgViewers !== null ? `~${avgViewers}` : 'Unknown',
      streamingFrequency: frequency,
      growthStage,
      strengths,
      weaknesses,
      opportunities,
      promotionPotential,
      friendMessage,
      promoterMessage,
      isLive,
      liveTitle: livestream?.session_title || null,
      liveGame: livestream?.categories?.[0]?.name || recentCategories?.[0]?.name || null,
      liveViewers: livestream?.viewer_count || null,
    };

    return new Response(JSON.stringify(analysis), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Kick analyze error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      return new Response(JSON.stringify({ error: 'Rate limited by Kick. Please wait a moment and try again.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function estimateAvgViewersFromHistory(channel: any): number | null {
  const streams = channel.previous_live_streams;
  if (!streams || streams.length === 0) return null;
  const total = streams.reduce((sum: number, s: any) => sum + (s.viewer_count || s.viewers || 0), 0);
  return Math.round(total / streams.length);
}

function estimateFrequency(channel: any): string {
  const streams = channel.previous_live_streams;
  if (!streams || streams.length < 2) return streams?.length === 1 ? 'Rarely' : 'Unknown';

  const dates = streams.map((s: any) => new Date(s.created_at || s.start_time).getTime()).sort();
  const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
  if (spanDays === 0) return '~Daily';

  const perWeek = (streams.length / spanDays) * 7;
  if (perWeek >= 5) return '~Daily (5+ times/week)';
  if (perWeek >= 3) return '3-4 times per week';
  if (perWeek >= 1.5) return '~2 times per week';
  if (perWeek >= 0.8) return '~Weekly';
  return 'Infrequent';
}

function determineGrowthStage(broadcasterType: string, followers: number | null, avgViewers: number | null): string {
  if (broadcasterType === 'verified') return 'Verified Creator';
  if (followers !== null && followers > 10000) return 'Established Creator';
  if (followers !== null && followers > 1000) return 'Growing Creator';
  if (avgViewers !== null && avgViewers > 10) return 'Small Creator';
  return 'New Streamer';
}

function estimateFollowers(broadcasterType: string, avgViewers: number | null): string {
  if (broadcasterType === 'verified') return '10,000+ (Verified)';
  if (broadcasterType === 'established') return '~1,000-10,000 (estimated)';
  if (avgViewers !== null && avgViewers > 50) return '~1,000-5,000 (estimated)';
  if (avgViewers !== null && avgViewers > 10) return '~200-1,000 (estimated)';
  return '< 200 (estimated)';
}

function generateStrengths(channel: any, displayName: string, isLive: boolean, livestream: any, avgViewers: number | null, frequency: string, followers: number | null): string[] {
  const s: string[] = [];
  if (channel.verified) s.push('Verified Kick creator — strong credibility');
  if (followers && followers > 5000) s.push(`Strong follower base (${followers.toLocaleString()})`);
  if (frequency.includes('Daily') || frequency.includes('3-4')) s.push('Consistent streaming schedule');
  if (isLive && livestream) s.push(`Currently live with ${livestream.viewer_count} viewers`);
  if (avgViewers && avgViewers > 20) s.push('Solid average viewership');
  if (channel.user?.bio && channel.user.bio.length > 30) s.push('Detailed channel bio');
  if (s.length === 0) s.push('Starting their Kick streaming journey — high growth potential');
  return s;
}

function generateWeaknesses(channel: any, avgViewers: number | null, frequency: string, followers: number | null): string[] {
  const w: string[] = [];
  if (avgViewers !== null && avgViewers < 10) w.push('Low average viewership — limited discoverability');
  if (frequency === 'Infrequent' || frequency === 'Unknown') w.push('Irregular streaming schedule');
  if (!channel.user?.bio || channel.user.bio.length < 20) w.push('Minimal channel bio');
  if (followers !== null && followers < 100) w.push('Small follower base — needs growth strategy');
  if (w.length === 0) w.push('No major weaknesses identified');
  return w;
}

function generateOpportunities(avgViewers: number | null, growthStage: string): string[] {
  const o: string[] = [];
  o.push('Kick is a growing platform — early adopter advantage');
  o.push('Clip-based content for TikTok and YouTube Shorts');
  if (growthStage === 'New Streamer' || growthStage === 'Small Creator') {
    o.push('Collaborate with similar-sized Kick streamers');
    o.push('Community events to boost engagement');
  }
  if (avgViewers !== null && avgViewers < 50) {
    o.push('Targeted promotion to increase discoverability');
  }
  o.push('Cross-platform presence (Twitch, YouTube, socials)');
  return o;
}

function generatePromotionPotential(growthStage: string, avgViewers: number | null, frequency: string): string {
  const consistent = frequency.includes('Daily') || frequency.includes('3-4') || frequency.includes('Weekly');

  if (growthStage === 'Verified Creator' || growthStage === 'Established Creator') {
    return 'Moderate — already established on Kick, but promotion could help expand into new audiences.';
  }
  if (consistent && (avgViewers === null || avgViewers < 50)) {
    return 'High — consistent streamer lacking audience growth. Promotion could significantly accelerate their path.';
  }
  if (!consistent) {
    return 'Medium — needs a more consistent schedule first, but promotion could provide motivation and results.';
  }
  return 'Good — solid foundation. Strategic promotion could push them past their current plateau.';
}

function generateFriendMessage(displayName: string, growthStage: string, livestream: any): string {
  if (livestream) {
    return `Hey ${displayName}! I just caught your stream on Kick playing ${livestream.categories?.[0]?.name || 'your game'} and your vibe is really solid! How long have you been on Kick? I feel like you're at that point where the right push could really change things 🔥`;
  }
  if (growthStage === 'New Streamer' || growthStage === 'Small Creator') {
    return `Hey ${displayName}! Found your Kick channel and I can tell you're putting in the work. The grind as a smaller streamer is real — how's it been going? Being on Kick early is a smart move, you've got something building here 💪`;
  }
  return `Hey ${displayName}! Been checking out your Kick channel and your content is really solid. How's the streaming journey been? I'm always curious to hear what creators at your level think about Kick's growth 🔥`;
}

function generatePromoterMessage(displayName: string, growthStage: string, avgViewers: number | null): string {
  const viewerNote = avgViewers !== null ? `averaging around ${avgViewers} viewers` : 'building your audience';

  if (growthStage === 'New Streamer' || growthStage === 'Small Creator') {
    return `Hi ${displayName}! I work with streamers in your stage of growth, and your Kick channel has strong potential. You're ${viewerNote}, and being on Kick early gives you a real edge. I'd love to chat about how we could get your stream in front of more eyes. Open to a quick conversation?`;
  }
  return `Hi ${displayName}! I've been following your Kick channel and I'm impressed by what you've built. You're ${viewerNote}, and with the right growth strategy, you could see a significant jump. I specialize in helping streamers break through to the next level. Would you be open to discussing some strategies?`;
}
