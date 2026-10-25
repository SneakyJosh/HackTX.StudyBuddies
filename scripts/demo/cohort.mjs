import { demoId } from "./ids.mjs";
import { addCalendarDays, chicagoDay, chicagoInstant, formatDay, liveSprintWindow } from "./time.mjs";

export const UNIVERSITY_ID = "22222222-2222-4222-8222-222222222222";
export const DEMO_COHORT = "hackathon-2026";
export const PROTECTED_EMAILS = [
  "demo-student-a@studysync.example",
  "demo-student-b@studysync.example",
];

export const COURSES = {
  M408C: "33333333-3333-4333-8333-333333333331",
  CS314: "33333333-3333-4333-8333-333333333332",
  BIO311C: "33333333-3333-4333-8333-333333333333",
};

export const LOCATIONS = {
  PCL: "11111111-1111-4111-8111-111111111111",
  EER: "11111111-1111-4111-8111-111111111112",
  UNION: "11111111-1111-4111-8111-111111111113",
  UTC: "11111111-1111-4111-8111-111111111114",
  WCP: "11111111-1111-4111-8111-111111111115",
  BTL: "11111111-1111-4111-8111-111111111116",
  FAC: "11111111-1111-4111-8111-111111111117",
  GDC: "11111111-1111-4111-8111-111111111118",
  WEL: "11111111-1111-4111-8111-111111111119",
  PMA: "11111111-1111-4111-8111-11111111111a",
  BUR: "11111111-1111-4111-8111-11111111111b",
  ECJ: "11111111-1111-4111-8111-11111111111c",
  LTD: "11111111-1111-4111-8111-11111111111d",
  LPC: "11111111-1111-4111-8111-11111111111e",
  UAA: "11111111-1111-4111-8111-11111111111f",
  MED: "11111111-1111-4111-8111-111111111120",
};

export const BOOKABLE_LOCATION_IDS = Object.entries(LOCATIONS)
  .filter(([code]) => code !== "LTD")
  .map(([, id]) => id);

const MATCH_POINTS = {
  sameActiveCourse: 40,
  sharedEnrolledCourse: 25,
  studyStyle: 20,
  sameLocation: 20,
  durationWithin30: 10,
  durationWithin60: 5,
  groupSize: 10,
};

const MATCH_REASONS = {
  sameActiveCourse: "Studying the same course",
  sharedEnrolledCourse: "Shares another enrolled course",
  studyStyle: "Compatible study style",
  sameLocation: "Same study location",
  durationWithin30: "Preferred duration within 30 minutes",
  durationWithin60: "Preferred duration within 60 minutes",
  groupSize: "Similar preferred group size",
};

const PEOPLE = [
  person("avery", "demo-host@studysync.example", "Avery Chen", "Computer Science", "junior", "collaborative", 60, 3, ["CS314", "M408C"], true, { location: "PCL", course: "CS314", availability: "available" }),
  person("riley", "demo-guest@studysync.example", "Riley Okonkwo", "Biology", "sophomore", "flexible", 90, 2, ["BIO311C", "CS314"], true, { location: "EER", course: "BIO311C", availability: "available" }),
  person("sam", "demo-timer@studysync.example", "Sam Patel", "Mechanical Engineering", "senior", "quiet", 45, 1, ["M408C"], true, { location: "PMA", course: "M408C", availability: "focused" }),
  person("jordan", "demo-jordan@studysync.example", "Jordan Lee", "Computer Science", "junior", "collaborative", 60, 3, ["CS314"], true, { location: "PCL", course: "CS314", availability: "available" }),
  person("priya", "demo-priya@studysync.example", "Priya Shah", "Mathematics", "sophomore", "quiet", 90, 2, ["M408C"], true, { location: "UTC", course: "M408C", availability: "available" }),
  person("marcus", "demo-marcus@studysync.example", "Marcus Brooks", "Electrical Engineering", "senior", "collaborative", 75, 4, ["CS314", "M408C"], true, { location: "WCP", course: "CS314", availability: "questions_only" }),
  person("hana", "demo-hana@studysync.example", "Hana Sato", "Computer Science", "freshman", "collaborative", 120, 3, ["CS314"], true, { location: "GDC", course: "CS314", availability: "available" }),
  person("noah", "demo-noah@studysync.example", "Noah Williams", "Finance", "sophomore", "quiet", 180, 6, ["BIO311C"], true, { location: "LPC", course: "BIO311C", availability: "available" }),
  person("quinn", "demo-quinn@studysync.example", "Quinn Alvarez", "Architecture", "senior", "flexible", 60, 3, ["CS314", "M408C"], true, null),
  person("lina", "demo-lina@studysync.example", "Lina Morales", "Nursing", "freshman", "quiet", 45, 1, ["M408C"], true, null),
  person("devon", "demo-devon@studysync.example", "Devon Clark", "Economics", "junior", "flexible", 90, 4, ["CS314", "BIO311C"], true, null),
  person("sofia", "demo-sofia@studysync.example", "Sofia Rossi", "Chemistry", "sophomore", "collaborative", 60, 2, ["M408C", "BIO311C"], true, null),
  person("ethan", "demo-ethan@studysync.example", "Ethan Wright", "Physics", "senior", "quiet", 120, 2, ["M408C"], true, null),
  person("aisha", "demo-aisha@studysync.example", "Aisha Rahman", "Informatics", "junior", "collaborative", 60, 3, ["CS314"], true, null),
  person("leo", "demo-leo@studysync.example", "Leo Martins", "Liberal Arts", "freshman", "flexible", 30, 2, ["BIO311C", "M408C"], true, null),
  person("maya", "demo-maya@studysync.example", "Maya Thompson", "Public Health", "senior", "quiet", 90, 1, ["BIO311C"], true, null),
  person("chris", "demo-chris@studysync.example", "Chris Nguyen", "Business", "sophomore", "collaborative", 75, 5, ["CS314"], true, null),
  person("grace", "demo-grace@studysync.example", "Grace Okoye", "Neuroscience", "junior", "flexible", 60, 3, ["BIO311C", "M408C"], true, null),
  person("jonah", "demo-jonah@studysync.example", "Jonah Blake", "Undeclared", "other", "quiet", 60, 2, ["M408C"], false, null),
  person("elena", "demo-elena@studysync.example", "Elena Vasquez", "Biology", "junior", "collaborative", 60, 4, ["BIO311C"], true, null),
];

const REQUESTS = [
  ["jordan", "avery", true],
  ["riley", "avery", true],
  ["priya", "avery", true],
  ["hana", "avery", true],
  ["noah", "avery", true],
  ["riley", "jordan", true],
  ["priya", "hana", true],
  ["marcus", "noah", true],
  ["hana", "riley", true],
  ["devon", "jordan", true],
  ["maya", "riley", true],
  ["aisha", "marcus", true],
  ["sofia", "avery", false],
  ["riley", "noah", false],
].map(([from, to, accept]) => ({ from, to, accept }));

const FUTURE_SESSIONS = [
  session("solo-diagram", "lina", "M408C", "PCL", "Diagram review", 1, "16:00", 60, "solo", 1, []),
  session("problem-set", "jordan", "CS314", "EER", "CS 314 problem set", 1, "17:00", 90, "open", 4, []),
  session("calc-review", "priya", "M408C", "UNION", "Calc review", 2, "14:00", 60, "open", 6, []),
  session("bio-writeup", "maya", "BIO311C", "GDC", "BIO writeup", 1, "18:00", 60, "invite_only", 3, ["riley"]),
  session("cafe-outline", "chris", "CS314", "UAA", "Outline at Up and Atom", 1, "15:00", 60, "open", 4, []),
];

const HISTORY_SESSIONS = [
  history("h-avery-lina", "avery", "CS314", "PCL", "Trees practice", -6, [
    rated("avery", "host", 55, 4, 5, [["lina", 5]]),
    rated("lina", "joiner", 50, 3, 4, [["avery", 4]]),
  ]),
  history("h-avery-5", "avery", "M408C", "PCL", "Integral set", -5, [rated("avery", "host", 40, 4, 4, [])]),
  history("h-avery-4", "avery", "CS314", "EER", "Lab outline", -4, [rated("avery", "host", 35, 5, 3, [])]),
  history("h-avery-3", "avery", "M408C", "UNION", "Problem drill", -3, [rated("avery", "host", 30, 3, 4, [])]),
  history("h-avery-2", "avery", "CS314", "GDC", "Unread notes", -2, [unrated("avery", "host", 25)]),
  history("h-avery-devon", "avery", "CS314", "PCL", "Review with Devon", -1, [
    rated("avery", "host", 50, 4, 5, [["devon", 4]]),
    rated("devon", "joiner", 45, 5, 4, [["avery", 5]]),
  ]),
  history("h-riley-grace", "riley", "BIO311C", "EER", "Lab recap", -3, [
    rated("riley", "host", 40, 5, 3, []),
    unrated("grace", "joiner", 40),
  ]),
  history("h-sam-ethan", "sam", "M408C", "MED", "Cafe problem set", -2, [
    unrated("sam", "host", 50),
    unrated("ethan", "joiner", 50),
  ]),
];

function person(key, email, name, major, year, style, duration, groupSize, courses, visible, checkin) {
  return {
    key,
    id: demoId(`user:${email}`),
    email,
    name,
    major,
    year,
    style,
    duration,
    groupSize,
    courses,
    visible,
    checkin: checkin ? { ...checkin, duration } : null,
  };
}

function session(key, host, course, location, title, dayOffset, time, durationMinutes, visibility, seatLimit, invitees) {
  return { key, host, course, location, title, dayOffset, time, durationMinutes, visibility, seatLimit, invitees };
}

function history(key, host, course, location, title, dayOffset, participants) {
  return { key, id: demoId(`session:${key}`), host, course, location, title, dayOffset, time: "15:00", durationMinutes: 60, participants };
}

function rated(key, role, creditedMinutes, studyTime, environment, chemistry) {
  return { key, role, status: "accepted", creditedMinutes, studyTime, environment, chemistry: chemistry.map(([partner, stars]) => ({ key: partner, stars })) };
}

function unrated(key, role, creditedMinutes) {
  return { key, role, status: "accepted", creditedMinutes, studyTime: null, environment: null, chemistry: [] };
}

function sameId(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

function intersects(left, right) {
  const ids = new Set(right.map((id) => id.toLowerCase()));
  return left.some((id) => ids.has(id.toLowerCase()));
}

export function scoreDemo(caller, candidate) {
  let compatibilityScore = 0;
  const reasons = [];
  const callerCourse = COURSES[caller.checkin.course];
  const candidateCourse = COURSES[candidate.checkin.course];
  const callerCourses = caller.courses.map((code) => COURSES[code]);
  const candidateCourses = candidate.courses.map((code) => COURSES[code]);
  if (sameId(callerCourse, candidateCourse)) {
    compatibilityScore += MATCH_POINTS.sameActiveCourse;
    reasons.push(MATCH_REASONS.sameActiveCourse);
  } else if (intersects(callerCourses, candidateCourses)) {
    compatibilityScore += MATCH_POINTS.sharedEnrolledCourse;
    reasons.push(MATCH_REASONS.sharedEnrolledCourse);
  }
  if (caller.style === candidate.style || caller.style === "flexible" || candidate.style === "flexible") {
    compatibilityScore += MATCH_POINTS.studyStyle;
    reasons.push(MATCH_REASONS.studyStyle);
  }
  if (sameId(LOCATIONS[caller.checkin.location], LOCATIONS[candidate.checkin.location])) {
    compatibilityScore += MATCH_POINTS.sameLocation;
    reasons.push(MATCH_REASONS.sameLocation);
  }
  const durationGap = Math.abs(caller.duration - candidate.duration);
  if (durationGap <= 30) {
    compatibilityScore += MATCH_POINTS.durationWithin30;
    reasons.push(MATCH_REASONS.durationWithin30);
  } else if (durationGap <= 60) {
    compatibilityScore += MATCH_POINTS.durationWithin60;
    reasons.push(MATCH_REASONS.durationWithin60);
  }
  if (Math.abs(caller.groupSize - candidate.groupSize) <= 1) {
    compatibilityScore += MATCH_POINTS.groupSize;
    reasons.push(MATCH_REASONS.groupSize);
  }
  return { compatibilityScore, reasons: compatibilityScore === 0 ? [] : reasons };
}

export function isDiscoverable(personRow) {
  return Boolean(personRow.visible && personRow.checkin && (personRow.checkin.availability === "available" || personRow.checkin.availability === "questions_only"));
}

export function connectCandidates(callerKey, plan) {
  const caller = plan.people.find((personRow) => personRow.key === callerKey);
  return plan.people
    .filter((personRow) => personRow.key !== callerKey && isDiscoverable(personRow))
    .map((personRow) => ({ person: personRow, ...scoreDemo(caller, personRow) }))
    .sort((left, right) => right.compatibilityScore - left.compatibilityScore || left.person.id.localeCompare(right.person.id));
}

export function expectedFriends(plan, key) {
  const accepted = new Set();
  for (const request of plan.requests) {
    if (!request.accept) continue;
    if (request.from === key) accepted.add(request.to);
    if (request.to === key) accepted.add(request.from);
  }
  return plan.people.filter((personRow) => accepted.has(personRow.key) && isDiscoverable(personRow));
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

export function validatePlan(plan) {
  const byKey = new Map(plan.people.map((personRow) => [personRow.key, personRow]));
  if (plan.people.length !== 20) throw new Error("the demo cohort must contain 20 accounts");
  if (new Set(plan.people.map((personRow) => personRow.email)).size !== 20) throw new Error("demo emails must be unique");
  if (new Set(plan.people.map((personRow) => personRow.id)).size !== 20) throw new Error("demo user ids must be unique");
  for (const personRow of plan.people) {
    if (PROTECTED_EMAILS.includes(personRow.email)) throw new Error("the demo cohort includes a preserved test account");
    if (!/^demo-[a-z]+@studysync\.example$/.test(personRow.email)) throw new Error("a demo email is not clearly synthetic");
    if (personRow.courses.length < 1 || personRow.courses.length > 8) throw new Error("a profile must enroll 1 to 8 courses");
    for (const code of personRow.courses) if (!COURSES[code]) throw new Error("a profile uses a course outside the catalog");
    if (personRow.checkin) {
      if (!personRow.visible) throw new Error("a hidden profile cannot check in");
      if (!BOOKABLE_LOCATION_IDS.includes(LOCATIONS[personRow.checkin.location])) throw new Error("a check-in uses a location that is not bookable");
      if (!personRow.courses.includes(personRow.checkin.course)) throw new Error("a check-in course is not on that profile");
      if (personRow.checkin.duration < 30 || personRow.checkin.duration > 180) throw new Error("a check-in duration is outside 30 to 180 minutes");
    }
  }
  const checkins = plan.people.filter((personRow) => personRow.checkin);
  if (checkins.length !== 8) throw new Error("the demo needs 8 check-ins");
  const pairs = new Set();
  for (const request of plan.requests) {
    const recipient = byKey.get(request.to);
    if (!recipient || !isDiscoverable(recipient)) throw new Error("a request recipient is not discoverable");
    if (request.from === request.to) throw new Error("a request targets the same account");
    const pair = [request.from, request.to].sort().join(":");
    if (pairs.has(pair)) throw new Error("two requests use the same pair");
    pairs.add(pair);
  }
  if (plan.requests.filter((request) => request.accept).length !== 12) throw new Error("the demo needs 12 accepted connections");
  if (plan.requests.filter((request) => !request.accept).length !== 2) throw new Error("the demo needs 2 pending requests");

  const commitments = [];
  const addCommitment = (key, start, end, label) => commitments.push({ key, start, end, label });
  for (const item of plan.history) {
    if (!BOOKABLE_LOCATION_IDS.includes(LOCATIONS[item.location])) throw new Error("history uses a location that is not bookable");
    const host = byKey.get(item.host);
    if (!host.courses.includes(item.course)) throw new Error("a history host is not enrolled in that course");
    const start = item.startsAt;
    const end = item.endsAt;
    const accepted = item.participants.filter((participant) => participant.status === "accepted");
    for (const participant of accepted) addCommitment(participant.key, start, end, item.key);
    for (const participant of item.participants) {
      const rated = participant.studyTime !== null;
      if (rated !== (participant.environment !== null)) throw new Error("study time and place ratings stay together");
      if (!rated && participant.chemistry.length > 0) throw new Error("an unrated attendance row cannot have chemistry");
      for (const rating of participant.chemistry) {
        if (rating.key === participant.key) throw new Error("chemistry cannot target the rater");
        if (!accepted.some((other) => other.key === rating.key)) throw new Error("chemistry must target an accepted partner");
      }
      if (participant.creditedMinutes < 1 || participant.creditedMinutes > item.durationMinutes) throw new Error("credited minutes are outside the booked session");
    }
  }
  for (const item of plan.future) {
    if (!BOOKABLE_LOCATION_IDS.includes(LOCATIONS[item.location])) throw new Error("a future session uses a location that is not bookable");
    const host = byKey.get(item.host);
    if (!host.courses.includes(item.course)) throw new Error("a future host is not enrolled in that course");
    if (item.visibility === "solo" && (item.seatLimit !== 1 || item.invitees.length !== 0)) throw new Error("a solo session has one seat and no invites");
    if (item.visibility === "invite_only" && item.invitees.length < 1) throw new Error("an invite-only session needs an invitee");
    if (item.invitees.length > item.seatLimit - 1) throw new Error("a session invites more people than it has seats");
    if (item.startsAt <= plan.generatedAt) throw new Error("a future session is not in the future");
    addCommitment(item.host, item.startsAt, item.endsAt, item.key);
    for (const invitee of item.invitees) {
      const connected = plan.requests.some((request) => request.accept && ((request.from === item.host && request.to === invitee) || (request.to === item.host && request.from === invitee)));
      if (!connected) throw new Error("an invitee is not an accepted study partner");
    }
  }
  if (plan.future.length + 1 !== 6) throw new Error("the demo needs 6 study groups");
  const sprint = plan.liveSprint;
  if (!BOOKABLE_LOCATION_IDS.includes(LOCATIONS[sprint.location])) throw new Error("the live sprint uses a location that is not bookable");
  if (!byKey.get(sprint.host).courses.includes(sprint.course)) throw new Error("the live sprint host is not enrolled");
  if (!(sprint.startsAt < plan.generatedAt && sprint.endsAt > plan.generatedAt)) throw new Error("the live sprint is not in progress");
  for (const key of sprint.accepted) addCommitment(key, sprint.startsAt, sprint.endsAt, sprint.key);
  for (const invitee of plan.future.flatMap((item) => item.invitees)) {
    if (commitments.some((row) => row.key === invitee && row.label === "bio-writeup")) throw new Error("an invitee must not receive a commitment");
  }
  for (let left = 0; left < commitments.length; left += 1) {
    for (let right = left + 1; right < commitments.length; right += 1) {
      if (commitments[left].key === commitments[right].key && rangesOverlap(commitments[left], commitments[right])) {
        throw new Error("two commitments for the same student overlap");
      }
    }
  }
  const attendance = plan.history.flatMap((item) => item.participants);
  if (attendance.length !== 12) throw new Error("the demo needs 12 completed attendance rows");
  const ratedRows = attendance.filter((row) => row.studyTime !== null);
  if (ratedRows.length !== 8) throw new Error("8 attendance rows need private ratings");
  if (attendance.filter((row) => row.studyTime === null).length !== 4) throw new Error("4 attendance rows stay unrated");
  if (attendance.reduce((sum, row) => sum + row.chemistry.length, 0) !== 4) throw new Error("4 chemistry ratings are required");
  const averyDays = plan.history
    .flatMap((item) => item.participants.filter((row) => row.key === "avery").map(() => item.campusDate))
    .sort();
  const yesterday = formatDay(addCalendarDays(chicagoDay(plan.generatedAt), -1));
  if (averyDays.length !== 6 || averyDays[5] !== yesterday) throw new Error("Avery's streak must end yesterday");
  const dayNumber = (iso) => {
    const [year, month, day] = iso.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  };
  for (let index = 1; index < averyDays.length; index += 1) {
    if (dayNumber(averyDays[index]) !== dayNumber(averyDays[index - 1]) + 1) throw new Error("Avery's streak days must be consecutive");
  }
  for (const item of plan.history) {
    for (const row of item.participants) {
      if (row.key === "avery" && row.creditedMinutes < 5) throw new Error("Avery's streak day is below 5 minutes");
    }
  }
  const serialized = JSON.stringify(plan);
  if (serialized.includes("@") && serialized.includes("password")) throw new Error("the plan must not carry a password");
  const rosterKeys = ["id", "displayName", "major", "academicYear", "role"];
  for (const item of plan.history) {
    for (const member of rosterFor(item, plan.people)) {
      if (Object.keys(member).join(",") !== rosterKeys.join(",")) throw new Error("a roster snapshot has an unexpected field");
    }
  }
  return plan;
}

export function rosterFor(item, people) {
  return item.participants
    .filter((row) => row.status === "accepted")
    .map((row) => {
      const personRow = people.find((candidate) => candidate.key === row.key);
      return { id: personRow.id, displayName: personRow.name, major: personRow.major, academicYear: personRow.year, role: row.role };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
}

function atChicago(now, dayOffset, time) {
  const [hour, minute] = time.split(":").map(Number);
  const day = addCalendarDays(chicagoDay(now), dayOffset);
  return { day, startsAt: chicagoInstant(day, hour, minute) };
}

export function buildPlan(now = new Date()) {
  const people = PEOPLE.map((personRow) => ({ ...personRow, courses: [...personRow.courses], checkin: personRow.checkin ? { ...personRow.checkin } : null }));
  const historyRows = HISTORY_SESSIONS.map((item) => {
    const when = atChicago(now, item.dayOffset, item.time);
    return {
      ...item,
      participants: item.participants.map((row) => ({ ...row, chemistry: row.chemistry.map((rating) => ({ ...rating })) })),
      campusDate: formatDay(when.day),
      startsAt: when.startsAt,
      endsAt: new Date(when.startsAt.getTime() + item.durationMinutes * 60 * 1000),
    };
  });
  const future = FUTURE_SESSIONS.map((item) => {
    const when = atChicago(now, item.dayOffset, item.time);
    return { ...item, invitees: [...item.invitees], localDate: formatDay(when.day), localTime: item.time, startsAt: when.startsAt, endsAt: new Date(when.startsAt.getTime() + item.durationMinutes * 60 * 1000) };
  });
  const sprintWindow = liveSprintWindow(now);
  const plan = {
    generatedAt: now,
    cohort: DEMO_COHORT,
    people,
    requests: REQUESTS.map((request) => ({ ...request })),
    future,
    history: historyRows,
    liveSprint: {
      key: "pcl-sprint",
      id: demoId("session:pcl-sprint"),
      host: "quinn",
      course: "CS314",
      location: "PCL",
      title: "PCL sprint",
      visibility: "open",
      seatLimit: 4,
      durationMinutes: 60,
      accepted: ["quinn", "avery", "riley"],
      startsAt: sprintWindow.start,
      endsAt: sprintWindow.end,
    },
  };
  return validatePlan(plan);
}

export function allowList(plan = buildPlan(new Date("2026-10-25T15:14:00.000Z"))) {
  return plan.people.map((personRow) => personRow.email);
}
