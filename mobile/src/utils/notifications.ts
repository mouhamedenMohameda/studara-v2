import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ─── Default handler ──────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

// ─── Permissions ──────────────────────────────────────────────────────────────
export const requestNotificationPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'التذكيرات',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D97706',
    });
    await Notifications.setNotificationChannelAsync('flashcards', {
      name: 'المراجعة اليومية',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#0891B2',
    });
    await Notifications.setNotificationChannelAsync('daily-challenge', {
      name: 'التحدي اليومي',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: '#7C3AED',
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

// ─── Reminders ────────────────────────────────────────────────────────────────
const TYPE_EMOJI: Record<string, string> = {
  exam: '📝', assignment: '📋', course: '📚', other: '🔔',
};
const TYPE_LABEL: Record<string, string> = {
  exam: 'امتحان', assignment: 'واجب', course: 'محاضرة', other: 'تذكير',
};

export const scheduleReminderNotification = async (reminder: {
  id: string;
  title: string;
  description?: string;
  reminderType: string;
  scheduledAt: string;
}): Promise<void> => {
  const date = new Date(reminder.scheduledAt);
  if (date <= new Date()) return; // don't schedule past reminders

  await cancelReminderNotification(reminder.id); // cancel previous if editing

  const emoji = TYPE_EMOJI[reminder.reminderType] ?? '🔔';
  const label = TYPE_LABEL[reminder.reminderType] ?? 'تذكير';

  await Notifications.scheduleNotificationAsync({
    identifier: `reminder-${reminder.id}`,
    content: {
      title: `${emoji} ${label}: ${reminder.title}`,
      body: reminder.description || 'موعدك اقترب',
      sound: true,
      data: { type: 'reminder', id: reminder.id },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
};

export const cancelReminderNotification = async (reminderId: string): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync(`reminder-${reminderId}`).catch(() => {});
};

// ─── Daily flashcard digest ───────────────────────────────────────────────────
export const scheduleDailyFlashcardDigest = async (dueCount: number): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync('daily-flashcard-digest').catch(() => {});
  if (dueCount === 0) return;

  const next8am = new Date();
  next8am.setDate(next8am.getDate() + 1);
  next8am.setHours(8, 0, 0, 0);

  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-flashcard-digest',
    content: {
      title: '🃏 وقت المراجعة!',
      body: `لديك ${dueCount} بطاقة جاهزة للمراجعة اليوم`,
      sound: true,
      data: { type: 'flashcard-digest' },
      ...(Platform.OS === 'android' && { channelId: 'flashcards' }),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: next8am },
  });
};

// ─── Daily Challenge Available notification ──────────────────────────────────
/**
 * Schedules a local notification for when today's daily challenge becomes
 * available (at show_from_hour:show_from_minute UTC).
 * Call this when the API returns notYetAvailable = true.
 * The notification is cancelled+replaced each time so there's never a duplicate.
 */
export const scheduleDailyChallengeNotification = async (
  showFromHour: number,
  showFromMinute: number,
): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync('daily-challenge-ready').catch(() => {});

  // Build the trigger time in local device time from the UTC target
  const now = new Date();
  const triggerUTC = new Date();
  triggerUTC.setUTCHours(showFromHour, showFromMinute, 0, 0);

  // If the time already passed today, don't schedule
  if (triggerUTC <= now) return;

  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-challenge-ready',
    content: {
      title: '🎲 التحدي اليومي جاهز!',
      body: 'انضم الآن وتنافس مع جميع الطلاب — قبل أن تنتهي المدة!',
      sound: true,
      data: { type: 'daily-challenge', navigate: 'DailyChallenge' },
      ...(Platform.OS === 'android' && { channelId: 'daily-challenge' }),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerUTC },
  });
};

export const cancelDailyChallengeNotification = async (): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync('daily-challenge-ready').catch(() => {});
};

// ─── Cancel all ───────────────────────────────────────────────────────────────
export const cancelAllNotifications = async (): Promise<void> => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};

// ─── Course Reminders (weekly recurring, 15 min before) ──────────────────────

/**
 * DayOfWeek enum: 0=Sun, 1=Mon, ..., 6=Sat
 * Expo WEEKLY weekday: 1=Sun, 2=Mon, ..., 7=Sat  (iOS calendar)
 */
export const scheduleCourseReminder = async (course: {
  id: string;
  nameAr: string;
  room?: string;
  dayOfWeek: number; // 0=Sun..6=Sat
  startTime: string; // 'HH:MM'
}): Promise<void> => {
  await cancelCourseReminder(course.id);

  const [hStr, mStr] = course.startTime.split(':');
  let hour = parseInt(hStr, 10);
  let minute = parseInt(mStr, 10) - 15;
  if (minute < 0) { minute += 60; hour -= 1; }
  if (hour < 0) return; // course starts before 00:15 — skip

  const room = course.room ? ` — ${course.room}` : '';

  await Notifications.scheduleNotificationAsync({
    identifier: `course-${course.id}`,
    content: {
      title: `📚 ${course.nameAr}${room}`,
      body: 'ستبدأ المحاضرة خلال 15 دقيقة',
      sound: true,
      data: { type: 'course', id: course.id },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: course.dayOfWeek + 1, // expo uses 1-indexed
      hour,
      minute,
    } as any,
  });
};

export const cancelCourseReminder = async (courseId: string): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync(`course-${courseId}`).catch(() => {});
};

// ─── Exam Reminders (J-7, J-3, J-1, J0) ────────────────────────────────────

/**
 * Schedule up to 4 notifications before an exam:
 * J-7, J-3, J-1 at 09:00, J0 at 08:00
 */
export const scheduleExamReminders = async (exam: {
  id: string;
  subject: string;
  examDate: string; // 'YYYY-MM-DD'
}): Promise<void> => {
  await cancelExamReminders(exam.id);

  const examDay = new Date(exam.examDate);
  examDay.setHours(0, 0, 0, 0);

  const reminders = [
    { daysOffset: -7, hour: 9,  suffix: 'w1',  body: `امتحان ${exam.subject} بعد 7 أيام — ابدأ المراجعة الآن! 📚` },
    { daysOffset: -3, hour: 9,  suffix: 'w3',  body: `امتحان ${exam.subject} بعد 3 أيام — راجع ملاحظاتك ✏️` },
    { daysOffset: -1, hour: 9,  suffix: 'w1d', body: `امتحان ${exam.subject} غداً — نظّم وقتك الليلة 🌙` },
    { daysOffset:  0, hour: 8,  suffix: 'day', body: `اليوم امتحان ${exam.subject} — حظاً موفقاً! 🎯` },
  ];

  const now = Date.now();

  for (const r of reminders) {
    const date = new Date(examDay);
    date.setDate(date.getDate() + r.daysOffset);
    date.setHours(r.hour, 0, 0, 0);
    if (date.getTime() <= now) continue; // skip past dates

    await Notifications.scheduleNotificationAsync({
      identifier: `exam-${exam.id}-${r.suffix}`,
      content: {
        title: `📝 ${exam.subject}`,
        body: r.body,
        sound: true,
        data: { type: 'exam', id: exam.id },
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
};

export const cancelExamReminders = async (examId: string): Promise<void> => {
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(`exam-${examId}-w1`),
    Notifications.cancelScheduledNotificationAsync(`exam-${examId}-w3`),
    Notifications.cancelScheduledNotificationAsync(`exam-${examId}-w1d`),
    Notifications.cancelScheduledNotificationAsync(`exam-${examId}-day`),
  ].map(p => p.catch(() => {})));
};

// ─── New Jobs Alert ──────────────────────────────────────────────────────────

/**
 * Schedule a notification for tomorrow 08:00 alerting the user of new matching jobs.
 * Pass count = 0 to cancel a pending alert.
 */
export const scheduleNewJobsNotification = async (
  count: number,
  domainLabel?: string,
): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync('new-jobs-alert').catch(() => {});
  if (count === 0) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('jobs', {
      name: 'وظائف جديدة',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#7C3AED',
    });
  }

  const next8am = new Date();
  next8am.setDate(next8am.getDate() + 1);
  next8am.setHours(8, 0, 0, 0);

  const body = domainLabel
    ? `${count} عرض جديد في مجال ${domainLabel}`
    : `${count} فرصة عمل جديدة تناسب تخصصك`;

  await Notifications.scheduleNotificationAsync({
    identifier: 'new-jobs-alert',
    content: {
      title: '💼 وظائف جديدة!',
      body,
      sound: true,
      data: { type: 'jobs' },
      ...(Platform.OS === 'android' && { channelId: 'jobs' }),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: next8am },
  });
};
// ─── Rage Quit Protection (3-day inactivity reminder) ────────────────────────

/**
 * Call once on every authenticated app launch.
 * Cancels any pending "rage quit" notification and reschedules it 3 days from now
 * at 09:00. If the user opens the app again before then, it resets automatically.
 * Only fires when truly inactive for 3+ consecutive days.
 */
export const scheduleRageQuitNotification = async (): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync('rage-quit').catch(() => {});

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('engagement', {
      name: 'تذكير المراجعة',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#7C3AED',
    }).catch(() => {});
  }

  const MESSAGES = [
    { title: '👋 مرحباً!',      body: 'لم نرك منذ 3 أيام… بطاقة واحدة فقط؟' },
    { title: '🔥 سلسلتك!',     body: 'لا تكسر سلسلتك! ادخل وراجع 5 دقائق فقط.' },
    { title: '📚 زاد ينتظرك',  body: 'لديك بطاقات للمراجعة — 3 دقائق تكفي.' },
    { title: '⏰ وقت المراجعة', body: 'كل يوم تأخير = معلومة تُنسى. افتح التطبيق!' },
  ];
  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  const trigger = new Date();
  trigger.setDate(trigger.getDate() + 3);
  trigger.setHours(9, 0, 0, 0);

  await Notifications.scheduleNotificationAsync({
    identifier: 'rage-quit',
    content: {
      title: msg.title,
      body:  msg.body,
      sound: true,
      data:  { type: 'engagement' },
      ...(Platform.OS === 'android' && { channelId: 'engagement' }),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  }).catch(() => {});
};