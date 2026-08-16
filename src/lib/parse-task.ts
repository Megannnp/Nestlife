"use client";

/**
 * 自然语言解析 — 从任务描述中提取日期/时间/优先级
 * 支持："明天下午3点交材料" / "后天上午10点开会" / "周五晚上复习" / "下午2点运动"
 */

export type ParsedTask = {
  title: string;
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  minutes?: number;
  priority?: "high" | "mid" | "low";
};

const WEEKDAY_KEYS: Record<string, number> = {
  周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 0,
  星期一: 1, 星期二: 2, 星期三: 3, 星期四: 4, 星期五: 5, 星期六: 6, 星期日: 0,
};

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 中文数字 → 数字（一/两/十/十三/二十三…） */
function cnToNum(s: string): number {
  const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 零: 0 };
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (a ? map[a] ?? 1 : 1) * 10 + (b ? map[b] ?? 0 : 0);
  }
  return map[s] ?? 0;
}

/** 解析相对日期：今天/明天/明早/后天/周X/下周三/大后天 */
function parseDate(text: string, now: Date): { date: string; rest: string } | null {
  let rest = text;
  let date: string | null = null;

  // 今天
  if (/今天/.test(text)) {
    date = fmtDate(now);
    rest = text.replace(/今天/g, "").trim();
  }
  // 明天（含明早/明晚）
  else if (/明天|明日|明早|明晚/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    date = fmtDate(d);
    rest = text.replace(/明天|明日|明早|明晚/g, "").trim();
  }
  // 大后天（必须先于"后天"，否则 /后天/ 会匹配"大后天"的子串）
  else if (/大后天/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 3);
    date = fmtDate(d);
    rest = text.replace(/大后天/g, "").trim();
  }
  // 后天
  else if (/后天/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    date = fmtDate(d);
    rest = text.replace(/后天/g, "").trim();
  }
  // 周X（"下X" 仅清理前缀，日期取最近的下一个 X，与原语义一致）
  else {
    for (const [key, weekday] of Object.entries(WEEKDAY_KEYS)) {
      if (text.includes(key)) {
        const d = new Date(now);
        let diff = (weekday - d.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        d.setDate(d.getDate() + diff);
        date = fmtDate(d);
        rest = text.replace(key, "").replace(/下[周个]?/, "").trim();
        break;
      }
    }
  }

  return date ? { date, rest } : null;
}

/** 解析时间：下午3点/15:00/3点/晚上8点/两点半/今晚8点 → HH:mm + 分钟数 */
function parseTime(text: string): { startTime: string; minutes: number; rest: string } | null {
  let rest = text;
  let hour: number | null = null;
  let minute = 0;

  // HH:mm 格式
  const hm = text.match(/(\d{1,2})[:：](\d{2})/);
  if (hm) {
    hour = parseInt(hm[1], 10);
    minute = parseInt(hm[2], 10);
    rest = text.replace(hm[0], "").trim();
  } else {
    // N点[半|X分]（支持阿拉伯数字与中文数字：三点半/两点半/十点）
    const m = text.match(/(上午|中午|下午|晚上|早上|凌晨)?\s*([0-9一两二三四五六七八九十]{1,3})\s*点(?:半|(\d{1,2})分)?/);
    if (m) {
      let h = cnToNum(m[2]);
      minute = m[3] ? parseInt(m[3], 10) : m[0].includes("半") ? 30 : 0;
      const t = text;
      // 时段按文本语义判断（"今晚8点"含"晚"→ 晚上20点）
      if (/下午|晚上|晚|夜/.test(t)) {
        if (h < 12) h += 12;
      } else if (/凌晨/.test(t)) {
        if (h === 12) h = 0;
      } else if (/上午|早上|晨|早/.test(t)) {
        // 上午/早上：保持原小时（"上午10点"→10:00；"明早7点"→7:00）
      } else if (/中午|午/.test(t)) {
        if (h < 12) h += 12; // 中午12点 → 12:00
      }
      // 无时段：保持原小时
      hour = h;
      rest = text.replace(m[0], "").trim();
    }
  }

  if (hour === null) return null;
  const startTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  // 根据时段估时长：上午/下午 180 分钟，晚上 120，中午 60
  const minutes = hour >= 19 ? 120 : hour >= 12 && hour < 14 ? 60 : hour >= 8 && hour < 12 ? 180 : 90;
  return { startTime, minutes, rest };
}

/** 主解析函数 */
export function parseTaskInput(text: string, now = new Date()): ParsedTask {
  let rest = text.trim();
  let date: string | undefined;
  let startTime: string | undefined;
  let minutes: number | undefined;
  let priority: "high" | "mid" | "low" | undefined;

  // 优先级：急/重要/马上 → 高；闲/有空 → 低
  if (/紧急|重要|马上|立刻|必须/.test(rest)) {
    priority = "high";
    rest = rest.replace(/紧急|重要|马上|立刻|必须/g, "").trim();
  } else if (/有空|不急|闲|改天|有空再说/.test(rest)) {
    priority = "low";
    rest = rest.replace(/有空|不急|闲|改天/g, "").trim();
  }

  // 时间（先于日期解析："周五晚上复习" → 晚上是时间）
  const timeResult = parseTime(rest);
  if (timeResult) {
    startTime = timeResult.startTime;
    minutes = timeResult.minutes;
    rest = timeResult.rest;
  }

  // 日期
  const dateResult = parseDate(rest, now);
  if (dateResult) {
    date = dateResult.date;
    rest = dateResult.rest;
  }

  return { title: rest || text.trim(), date, startTime, minutes, priority };
}
