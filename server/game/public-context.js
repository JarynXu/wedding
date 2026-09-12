/** 只装配请柬中公开的婚礼事实，联系方式占位值和素材配置不进入主持人上下文。 */
export function publicWeddingFacts(config) {
  return {
    groom: config.groom.name,
    bride: config.bride.name,
    date: config.date.formattedFullZh,
    weekday: config.date.dayOfWeekZh,
    schedule: config.schedule.map(({ time, title }) => ({ time, title })),
    venue: { name: config.venue.name, hall: config.venue.hall, address: config.venue.address },
  };
}
