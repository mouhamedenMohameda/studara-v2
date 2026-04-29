#!/usr/bin/env python3
# Writes the new App Store screenshots HTML
import os
TARGET = os.path.join(os.path.dirname(__file__), "store-screenshots.html")

HTML = r"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Studara — App Store Screenshots</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{
  background:#111827;
  font-family:-apple-system,'SF Pro Display','Segoe UI','Noto Naskh Arabic','Cairo',sans-serif;
  padding:48px 24px 80px;
}
.page-title{text-align:center;color:#fff;font-size:28px;font-weight:900;letter-spacing:-0.5px;margin-bottom:6px;}
.page-sub{text-align:center;color:rgba(255,255,255,0.40);font-size:13px;margin-bottom:10px;}
.export-tip{
  text-align:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
  border-radius:12px;padding:12px 18px;font-size:12px;color:rgba(255,255,255,0.50);
  max-width:680px;margin:0 auto 48px;line-height:20px;
}
.export-tip code{background:rgba(255,255,255,0.10);border-radius:4px;padding:1px 6px;font-family:monospace;}
.grid{display:flex;flex-wrap:wrap;gap:24px;justify-content:center;max-width:1700px;margin:0 auto;}

/* ══════════════════════════════════════════════════════
   SHOT  390 × 844  (9:19.5)  — this IS the screenshot
   ══════════════════════════════════════════════════════ */
.shot{
  width:390px;height:844px;
  border-radius:50px;overflow:hidden;position:relative;flex-shrink:0;
  box-shadow:0 0 0 1px rgba(255,255,255,0.07),0 40px 100px rgba(0,0,0,0.70);
}
.bg-teal    {background:linear-gradient(155deg,#0F9C8F 0%,#0D9488 45%,#05524F 100%);}
.bg-purple  {background:linear-gradient(155deg,#6D28D9 0%,#4C1D95 55%,#2D1B69 100%);}
.bg-blue    {background:linear-gradient(155deg,#2563EB 0%,#1D4ED8 50%,#1E3A8A 100%);}
.bg-cyan    {background:linear-gradient(155deg,#0891B2 0%,#0E7490 50%,#083344 100%);}
.bg-rose    {background:linear-gradient(155deg,#E11D48 0%,#BE185D 50%,#700030 100%);}
.bg-amber   {background:linear-gradient(155deg,#F59E0B 0%,#D97706 45%,#78350F 100%);}
.bg-emerald {background:linear-gradient(155deg,#10B981 0%,#059669 50%,#022C22 100%);}
.bg-dark    {background:linear-gradient(155deg,#0D9488 0%,#065F59 45%,#042F2E 100%);}
.shot::before{
  content:'';position:absolute;inset:0;pointer-events:none;z-index:1;
  background:radial-gradient(ellipse 90% 50% at 50% -5%,rgba(255,255,255,0.16) 0%,transparent 65%);
}
.shot>*{position:relative;z-index:2;}

/* ── Top text block ── */
.top{padding:58px 38px 0;}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.50);margin-bottom:12px;}
.h1{font-size:46px;font-weight:900;color:#fff;line-height:1.06;letter-spacing:-1.5px;margin-bottom:10px;}
.sub{font-size:15px;color:rgba(255,255,255,0.65);font-weight:500;line-height:1.5;}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px;}
.chip{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);border-radius:99px;padding:6px 13px;font-size:12px;font-weight:700;color:#fff;}

/* ── Floating card ── */
.fcard{
  position:absolute;z-index:20;background:rgba(255,255,255,0.96);
  border-radius:18px;padding:11px 14px;box-shadow:0 10px 32px rgba(0,0,0,0.22);
  display:flex;align-items:center;gap:10px;backdrop-filter:blur(16px);
}
.fc-icon{font-size:20px;}
.fc-title{font-size:11px;font-weight:800;color:#111;line-height:1.3;}
.fc-sub{font-size:10px;color:#888;font-weight:500;margin-top:1px;}

/* ── Phone shell ── */
.phone-wrap{position:absolute;bottom:-36px;left:50%;transform:translateX(-50%);width:258px;}
.phone-wrap.lg{width:285px;bottom:-48px;}
.phone-wrap.top{bottom:auto;top:52px;}
.phone{
  width:100%;aspect-ratio:9/19.5;background:#fff;border-radius:36px;overflow:hidden;position:relative;
  box-shadow:0 0 0 2px rgba(255,255,255,0.16),0 0 0 4.5px rgba(0,0,0,0.28),
    0 28px 70px rgba(0,0,0,0.55),inset 0 1px 0 rgba(255,255,255,0.6);
}
.phone::before{
  content:'';position:absolute;top:9px;left:50%;transform:translateX(-50%);
  width:88px;height:26px;border-radius:13px;background:#0A0A0A;z-index:99;
}
.pscreen{width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;}

/* ── Bottom text ── */
.bot{position:absolute;bottom:36px;left:38px;right:38px;display:flex;flex-direction:column;gap:8px;}
.bot .h1{font-size:42px;}
.bot .sub{font-size:14px;}

/* ── Mini UI components ── */
.sb{display:flex;justify-content:space-between;align-items:center;padding:14px 18px 4px;font-size:11px;font-weight:700;color:#0A0A0A;margin-top:28px;flex-shrink:0;}
.s-head{background:linear-gradient(135deg,#14B8A6,#065F59);padding:12px 14px 14px;flex-shrink:0;position:relative;overflow:hidden;}
.s-head::after{content:'';position:absolute;width:120px;height:120px;border-radius:60px;background:rgba(255,255,255,0.06);top:-40px;right:-25px;}
.sh-title{font-size:16px;font-weight:900;color:#fff;}
.sh-sub{font-size:10px;color:rgba(255,255,255,0.60);margin-top:1px;}
.pad{padding:9px 13px;flex:1;overflow:hidden;display:flex;flex-direction:column;gap:7px;padding-bottom:58px;}
.row{display:flex;align-items:center;gap:8px;}
.card{background:#fff;border:1.5px solid #EFEFEF;border-radius:13px;padding:9px 11px;}
.ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;}
.lbl{font-size:11px;font-weight:700;color:#0A0A0A;}
.meta{font-size:9px;color:#A3A3A3;margin-top:1px;}
.pill{border-radius:99px;padding:2px 8px;font-size:9px;font-weight:800;}
.search{background:#F5F5F5;border-radius:10px;padding:7px 10px;display:flex;align-items:center;gap:6px;flex-shrink:0;}
.search span{font-size:10px;color:#A3A3A3;}
.bot-nav{
  position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,0.96);
  border-top:1px solid #F0F0F0;display:flex;align-items:center;justify-content:space-between;
  padding:9px 26px 16px;z-index:50;backdrop-filter:blur(12px);
}
.nb{display:flex;flex-direction:column;align-items:center;gap:1px;font-size:9px;color:#C0C0C0;}
.nb.on{color:#0D9488;}
.nc{width:44px;height:44px;border-radius:22px;background:linear-gradient(135deg,#14B8A6,#065F59);
  display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:200;color:#fff;
  margin-top:-18px;box-shadow:0 4px 14px rgba(13,148,136,0.50);}
.foc{border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(13,148,136,0.22);flex-shrink:0;}
.foc-in{padding:13px;background:linear-gradient(135deg,#14B8A6,#065F59);}
.foc-row{display:flex;justify-content:space-between;margin-bottom:8px;}
.foc-av{width:30px;height:30px;border-radius:15px;background:rgba(255,255,255,0.20);border:2px solid rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;}
.foc-div{height:1px;background:rgba(255,255,255,0.18);margin-bottom:7px;}
.foc-stats{display:flex;}
.foc-st{flex:1;text-align:center;}
.foc-sep{width:1px;background:rgba(255,255,255,0.18);margin:3px 0;}
.foc-n{font-size:15px;font-weight:900;color:#fff;}
.foc-l{font-size:8px;color:rgba(255,255,255,0.60);font-weight:600;margin-top:1px;}
.foc-xrow{display:flex;gap:4px;margin-top:5px;}
.foc-x{background:rgba(255,255,255,0.15);border-radius:99px;padding:3px 6px;font-size:8px;color:#fff;font-weight:700;}
.tabs{display:flex;background:#F5F5F5;border-radius:9px;padding:3px;flex-shrink:0;}
.tab{flex:1;text-align:center;padding:5px;font-size:10px;font-weight:700;}
.tab.on{background:#fff;border-radius:7px;color:#0D9488;box-shadow:0 1px 4px rgba(0,0,0,0.08);}
.tab.off{color:#A3A3A3;}
</style>
</head>
<body>

<div class="page-title">Studara — App Store Screenshots</div>
<p class="page-sub">8 captures · Format iPhone 390 × 844 · Ratio 9:19.5</p>
<div class="export-tip">
  Pour exporter → Chrome DevTools (F12) → icône mobile → <code>390×844</code> → bouton Capture screenshot<br>
  Redimensionnez à <code>1290 × 2796 px</code> (App Store) ou <code>1080 × 2400 px</code> (Google Play)
</div>

<div class="grid">

<!-- 01 HOME -->
<div class="shot bg-teal">
  <div class="top">
    <div class="eyebrow">لوحة التحكم</div>
    <div class="h1">كل شيء<br>في مكان<br>واحد</div>
    <div class="sub">إحصاءاتك الجامعية يومياً</div>
    <div class="chips">
      <div class="chip">🔥 7 أيام متتالية</div>
      <div class="chip">⭐ 340 XP</div>
    </div>
  </div>
  <div class="fcard" style="top:74px;left:28px;">
    <div class="fc-icon">🔥</div>
    <div><div class="fc-title">سلسلة 7 أيام</div><div class="fc-sub">استمر! 🎯</div></div>
  </div>
  <div class="phone-wrap lg">
    <div class="phone"><div class="pscreen">
      <div class="sb"><span style="font-size:12px;font-weight:800;">09:41</span><span>▲ 📶 🔋</span></div>
      <div style="flex:1;overflow:hidden;position:relative;">
        <div style="padding:4px 12px 0;">
          <div class="foc"><div class="foc-in">
            <div class="foc-row">
              <div><div style="font-size:8px;color:rgba(255,255,255,0.60);font-weight:600;">صباح الخير ☀️</div><div style="font-size:16px;font-weight:900;color:#fff;">أحمد</div></div>
              <div class="foc-av">أ</div>
            </div>
            <div class="foc-div"></div>
            <div class="foc-stats">
              <div class="foc-st"><div class="foc-n">5</div><div class="foc-l">بطاقات</div></div>
              <div class="foc-sep"></div>
              <div class="foc-st"><div class="foc-n">3</div><div class="foc-l">تذكيرات</div></div>
              <div class="foc-sep"></div>
              <div class="foc-st"><div class="foc-n">62</div><div class="foc-l">ملف</div></div>
            </div>
            <div class="foc-xrow">
              <div class="foc-x">🔥 7 أيام</div>
              <div class="foc-x">⭐ 340 XP</div>
              <div class="foc-x">📅 Math</div>
            </div>
          </div></div>
        </div>
        <div style="padding:7px 12px 0;display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div class="card row"><div class="ic" style="background:#8B5CF618;">📚</div><div><div class="lbl">الموارد</div><div class="meta">62 ملف</div></div></div>
          <div class="card row"><div class="ic" style="background:#3B82F618;">📅</div><div><div class="lbl">الجدول</div></div></div>
          <div class="card row"><div class="ic" style="background:#0EA5E918;">🃏</div><div><div class="lbl">البطاقات</div><div class="meta">5 للمراجعة</div></div></div>
          <div class="card row"><div class="ic" style="background:#F9731618;">💼</div><div><div class="lbl">وظائف</div></div></div>
        </div>
        <div style="padding:6px 12px 0;">
          <div style="font-size:10px;font-weight:800;color:#0A0A0A;margin-bottom:4px;">اليوم</div>
          <div class="card" style="display:flex;align-items:center;gap:7px;overflow:hidden;">
            <div style="width:3px;background:#DC2626;border-radius:2px;align-self:stretch;margin:-9px 0 -9px -11px;flex-shrink:0;"></div>
            <div class="ic" style="background:#DC262610;font-size:11px;width:26px;height:26px;border-radius:7px;">📝</div>
            <div style="flex:1;"><div class="lbl">امتحان الرياضيات</div><div class="meta">10:00 صباحاً</div></div>
            <div class="pill" style="background:#DC262610;color:#DC2626;">10:00</div>
          </div>
        </div>
      </div>
      <div class="bot-nav">
        <div class="nb on">🏠<span>الرئيسية</span></div>
        <div class="nc">＋</div>
        <div class="nb">👤<span>حسابي</span></div>
      </div>
    </div></div>
  </div>
</div>

<!-- 02 RESOURCES -->
<div class="shot bg-purple">
  <div class="top">
    <div class="eyebrow">الموارد الأكاديمية</div>
    <div class="h1">آلاف<br>الملفات<br>مجاناً</div>
    <div class="sub">ملاحظات · مواضيع · ملخصات</div>
    <div class="chips">
      <div class="chip">📝 ملاحظات</div>
      <div class="chip">📋 مواضيع قديمة</div>
      <div class="chip">⬇ تحميل</div>
    </div>
  </div>
  <div class="fcard" style="bottom:330px;left:20px;">
    <div class="fc-icon">📥</div>
    <div><div class="fc-title">589 تحميل</div><div class="fc-sub">الأكثر شعبية</div></div>
  </div>
  <div class="phone-wrap">
    <div class="phone"><div class="pscreen">
      <div class="sb"><span style="font-size:12px;font-weight:800;">09:41</span><span>📶 🔋</span></div>
      <div class="s-head"><div class="sh-title">الموارد الأكاديمية</div><div class="sh-sub">62 ملف متاح</div></div>
      <div class="pad">
        <div class="search"><span>🔍</span><span>ابحث في الموارد…</span></div>
        <div style="display:flex;gap:5px;flex-shrink:0;">
          <div style="background:#7C3AED;color:#fff;border-radius:99px;padding:4px 10px;font-size:9px;font-weight:700;">الكل</div>
          <div style="background:#F5F5F5;color:#525252;border-radius:99px;padding:4px 10px;font-size:9px;font-weight:700;">ملاحظات</div>
          <div style="background:#F5F5F5;color:#525252;border-radius:99px;padding:4px 10px;font-size:9px;font-weight:700;">مواضيع</div>
        </div>
        <div class="card row"><div class="ic" style="background:#8B5CF618;">📝</div><div style="flex:1;"><div class="lbl">ملاحظات الرياضيات — تحليل</div><div class="meta">ملاحظات · رياضيات · س1</div></div><span style="font-size:16px;color:#8B5CF6;">⬇</span></div>
        <div class="card row"><div class="ic" style="background:#EF444418;">📋</div><div style="flex:1;"><div class="lbl">مواضيع الفيزياء 2023</div><div class="meta">موضوع قديم · فيزياء · س1</div></div><span style="font-size:16px;color:#EF4444;">⬇</span></div>
        <div class="card row"><div class="ic" style="background:#10B98118;">📖</div><div style="flex:1;"><div class="lbl">ملخص الكيمياء العضوية</div><div class="meta">ملخص · كيمياء · س2</div></div><span style="font-size:16px;color:#10B981;">⬇</span></div>
        <div class="card row"><div class="ic" style="background:#F59E0B18;">✏️</div><div style="flex:1;"><div class="lbl">تمارين محلولة — الإحصاء</div><div class="meta">تمارين · إحصاء · س2</div></div><span style="font-size:16px;color:#F59E0B;">⬇</span></div>
        <div class="card row"><div class="ic" style="background:#3B82F618;">🚀</div><div style="flex:1;"><div class="lbl">مشروع React — برمجة ويب</div><div class="meta">مشروع · معلوماتية · س3</div></div><span style="font-size:16px;color:#3B82F6;">⬇</span></div>
      </div>
      <div class="bot-nav"><div class="nb">🏠</div><div class="nc">＋</div><div class="nb">👤</div></div>
    </div></div>
  </div>
</div>

<!-- 03 TIMETABLE (phone top, text bottom) -->
<div class="shot bg-blue">
  <div class="phone-wrap lg top" style="left:50%;transform:translateX(-50%);">
    <div class="phone"><div class="pscreen">
      <div class="sb"><span style="font-size:12px;font-weight:800;">09:41</span><span>📶 🔋</span></div>
      <div class="s-head"><div class="sh-title">الجدول الدراسي</div><div class="sh-sub">الاثنين · 9 أبريل 2026</div></div>
      <div class="pad">
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <div style="background:rgba(255,255,255,0.10);border-radius:9px;padding:5px 6px;text-align:center;font-size:8px;font-weight:700;color:rgba(255,255,255,0.5);width:36px;">أح<br><span style="font-size:11px;">1</span></div>
          <div style="background:#fff;border-radius:9px;padding:5px 6px;text-align:center;font-size:8px;font-weight:700;color:#2563EB;width:36px;">إث<br><span style="font-size:11px;">2</span></div>
          <div style="background:rgba(255,255,255,0.10);border-radius:9px;padding:5px 6px;text-align:center;font-size:8px;font-weight:700;color:rgba(255,255,255,0.5);width:36px;">ثل<br><span style="font-size:11px;">3</span></div>
          <div style="background:rgba(255,255,255,0.10);border-radius:9px;padding:5px 6px;text-align:center;font-size:8px;font-weight:700;color:rgba(255,255,255,0.5);width:36px;">أر<br><span style="font-size:11px;">4</span></div>
          <div style="background:rgba(255,255,255,0.10);border-radius:9px;padding:5px 6px;text-align:center;font-size:8px;font-weight:700;color:rgba(255,255,255,0.5);width:36px;">خم<br><span style="font-size:11px;">5</span></div>
        </div>
        <div class="card" style="display:flex;align-items:center;gap:0;padding:0;overflow:hidden;"><div style="width:4px;background:#3B82F6;align-self:stretch;flex-shrink:0;"></div><div style="padding:8px 10px;flex:1;"><div class="lbl">الرياضيات التحليلية</div><div class="meta">د. محمد سالم · أ102</div></div><div class="pill" style="background:#3B82F610;color:#3B82F6;margin-left:7px;margin-right:7px;">08:00</div></div>
        <div class="card" style="display:flex;align-items:center;gap:0;padding:0;overflow:hidden;"><div style="width:4px;background:#10B981;align-self:stretch;flex-shrink:0;"></div><div style="padding:8px 10px;flex:1;"><div class="lbl">الفيزياء النووية</div><div class="meta">د. أمينة · ب205</div></div><div class="pill" style="background:#10B98110;color:#10B981;margin-left:7px;margin-right:7px;">10:30</div></div>
        <div class="card" style="display:flex;align-items:center;gap:0;padding:0;overflow:hidden;"><div style="width:4px;background:#8B5CF6;align-self:stretch;flex-shrink:0;"></div><div style="padding:8px 10px;flex:1;"><div class="lbl">برمجة متقدمة — Python</div><div class="meta">د. إبراهيم · مختبر 1</div></div><div class="pill" style="background:#8B5CF610;color:#8B5CF6;margin-left:7px;margin-right:7px;">14:00</div></div>
        <div class="card" style="display:flex;align-items:center;gap:0;padding:0;overflow:hidden;"><div style="width:4px;background:#F59E0B;align-self:stretch;flex-shrink:0;"></div><div style="padding:8px 10px;flex:1;"><div class="lbl">الإحصاء التطبيقي</div><div class="meta">د. خديجة · أ103</div></div><div class="pill" style="background:#F59E0B10;color:#F59E0B;margin-left:7px;margin-right:7px;">16:30</div></div>
      </div>
      <div class="bot-nav"><div class="nb">🏠</div><div class="nc">＋</div><div class="nb">👤</div></div>
    </div></div>
  </div>
  <div class="bot">
    <div class="h1" style="font-size:42px;">جدولك<br>دائماً<br>معك</div>
    <div class="sub">نظّم مواعيد محاضراتك بضغطة</div>
  </div>
</div>

<!-- 04 FLASHCARDS -->
<div class="shot bg-cyan">
  <div class="top">
    <div class="eyebrow">نظام SRS</div>
    <div class="h1">ذاكر<br>بذكاء<br>أكثر</div>
    <div class="sub">مراجعة متباعدة تُثبّت المعلومات</div>
  </div>
  <div class="fcard" style="top:70px;left:24px;">
    <div class="fc-icon">🎯</div>
    <div><div class="fc-title">5 بطاقات اليوم</div><div class="fc-sub">مستحقة للمراجعة</div></div>
  </div>
  <div class="phone-wrap">
    <div class="phone"><div class="pscreen">
      <div class="sb"><span style="font-size:12px;font-weight:800;">09:41</span><span>📶 🔋</span></div>
      <div class="s-head"><div class="sh-title">بطاقاتي</div><div class="sh-sub">3 حزم · 5 للمراجعة</div></div>
      <div class="pad">
        <div style="background:linear-gradient(90deg,#0EA5E920,#0891B220);border:1.5px solid #0EA5E940;border-radius:11px;padding:9px 10px;display:flex;align-items:center;gap:7px;flex-shrink:0;">
          <span style="font-size:18px;">🎯</span>
          <div style="flex:1;"><div style="font-size:11px;font-weight:800;color:#0E7490;">5 بطاقات مستحقة اليوم</div><div style="font-size:9px;color:#0891B2;margin-top:1px;">ابدأ المراجعة!</div></div>
          <div style="background:linear-gradient(90deg,#14B8A6,#0891B2);border-radius:99px;padding:5px 9px;font-size:9px;font-weight:700;color:#fff;white-space:nowrap;">مراجعة</div>
        </div>
        <div class="card row"><div class="ic" style="background:#8B5CF622;font-size:14px;width:30px;height:30px;border-radius:8px;">🃏</div><div style="flex:1;"><div class="lbl">الرياضيات — التفاضل</div><div class="meta">24 بطاقة</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;"><div class="pill" style="background:#8B5CF618;color:#8B5CF6;">3 مستحق</div><div style="background:linear-gradient(90deg,#14B8A6,#0891B2);border-radius:99px;padding:3px 8px;font-size:9px;font-weight:700;color:#fff;">مراجعة</div></div></div>
        <div class="card row"><div class="ic" style="background:#0EA5E922;font-size:14px;width:30px;height:30px;border-radius:8px;">💡</div><div style="flex:1;"><div class="lbl">الفيزياء — الكهرباء</div><div class="meta">18 بطاقة</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;"><div class="pill" style="background:#0EA5E918;color:#0EA5E9;">2 مستحق</div><div style="background:linear-gradient(90deg,#14B8A6,#0891B2);border-radius:99px;padding:3px 8px;font-size:9px;font-weight:700;color:#fff;">مراجعة</div></div></div>
        <div class="card row"><div class="ic" style="background:#10B98122;font-size:14px;width:30px;height:30px;border-radius:8px;">🧬</div><div style="flex:1;"><div class="lbl">الكيمياء — الجدول الدوري</div><div class="meta">36 بطاقة</div></div><div class="pill" style="background:#ECFDF5;color:#059669;">✅ منتهي</div></div>
        <div style="border:2px dashed #EFEFEF;border-radius:11px;padding:8px;text-align:center;color:#A3A3A3;font-size:10px;font-weight:700;flex-shrink:0;">＋ حزمة جديدة</div>
      </div>
      <div class="bot-nav"><div class="nb">🏠</div><div class="nc">＋</div><div class="nb">👤</div></div>
    </div></div>
  </div>
</div>

<!-- 05 REMINDERS -->
<div class="shot bg-rose">
  <div class="top">
    <div class="eyebrow">التذكيرات</div>
    <div class="h1">لا يفوتك<br>موعد<br>مهم</div>
    <div class="sub">إشعارات تلقائية للامتحانات والتكاليف</div>
  </div>
  <div class="fcard" style="top:72px;left:24px;">
    <div class="fc-icon">🔔</div>
    <div><div class="fc-title">تذكير تلقائي</div><div class="fc-sub">قبل الموعد بساعة</div></div>
  </div>
  <div class="phone-wrap">
    <div class="phone"><div class="pscreen">
      <div class="sb"><span style="font-size:12px;font-weight:800;">09:41</span><span>📶 🔋</span></div>
      <div class="s-head"><div class="sh-title">التذكيرات</div><div class="sh-sub">3 تذكيرات نشطة</div></div>
      <div class="pad">
        <div class="tabs"><div class="tab on">شخصية</div><div class="tab off">عامة</div></div>
        <div style="font-size:9px;font-weight:700;color:#EF4444;flex-shrink:0;">⚠ متأخرة</div>
        <div class="card" style="display:flex;align-items:center;gap:0;padding:0;overflow:hidden;"><div style="width:3px;background:#EF4444;align-self:stretch;flex-shrink:0;"></div><div style="width:22px;height:22px;border-radius:11px;background:#10B981;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;margin:0 7px;flex-shrink:0;">✓</div><div class="ic" style="background:#EF444410;font-size:10px;width:24px;height:24px;border-radius:7px;margin-left:0;">📝</div><div style="padding:7px 7px 7px 5px;flex:1;"><div class="lbl">تسليم تقرير الفيزياء</div><div style="display:flex;gap:3px;margin-top:1px;"><div style="background:#FEF2F2;color:#EF4444;border-radius:99px;padding:1px 5px;font-size:8px;font-weight:700;">متأخر</div></div></div></div>
        <div style="font-size:9px;font-weight:700;color:#0D9488;flex-shrink:0;">📋 نشطة</div>
        <div class="card" style="display:flex;align-items:center;gap:0;padding:0;overflow:hidden;"><div style="width:3px;background:#DC2626;align-self:stretch;flex-shrink:0;"></div><div style="width:22px;height:22px;border-radius:11px;border:2px solid #D1D5DB;margin:0 7px;flex-shrink:0;"></div><div class="ic" style="background:#DC262610;font-size:10px;width:24px;height:24px;border-radius:7px;margin-left:0;">📝</div><div style="padding:7px 7px 7px 5px;flex:1;"><div class="lbl">امتحان الرياضيات</div><div class="meta">غد · 10:00 ص</div></div><div class="pill" style="background:#DC262610;color:#DC2626;margin-left:5px;margin-right:5px;">غد</div></div>
        <div class="card" style="display:flex;align-items:center;gap:0;padding:0;overflow:hidden;"><div style="width:3px;background:#7C3AED;align-self:stretch;flex-shrink:0;"></div><div style="width:22px;height:22px;border-radius:11px;border:2px solid #D1D5DB;margin:0 7px;flex-shrink:0;"></div><div class="ic" style="background:#7C3AED10;font-size:10px;width:24px;height:24px;border-radius:7px;margin-left:0;">📄</div><div style="padding:7px 7px 7px 5px;flex:1;"><div class="lbl">مشروع برمجة الويب</div><div class="meta">15 أبريل</div></div><div class="pill" style="background:#7C3AED10;color:#7C3AED;margin-left:5px;margin-right:5px;">15 أبر</div></div>
        <div style="background:linear-gradient(90deg,#14B8A6,#0D9488);border-radius:99px;padding:8px;text-align:center;color:#fff;font-size:11px;font-weight:800;flex-shrink:0;">＋ تذكير جديد</div>
      </div>
      <div class="bot-nav"><div class="nb">🏠</div><div class="nc">＋</div><div class="nb">👤</div></div>
    </div></div>
  </div>
</div>

<!-- 06 JOBS (phone top, text bottom) -->
<div class="shot bg-amber">
  <div class="phone-wrap lg top" style="left:50%;transform:translateX(-50%);">
    <div class="phone"><div class="pscreen">
      <div class="sb"><span style="font-size:12px;font-weight:800;">09:41</span><span>📶 🔋</span></div>
      <div class="s-head"><div class="sh-title">الوظائف والتدريب</div><div class="sh-sub">24 فرصة متاحة</div></div>
      <div class="pad">
        <div class="search"><span>🔍</span><span>ابحث عن وظيفة…</span></div>
        <div style="display:flex;gap:5px;flex-shrink:0;">
          <div style="background:#D97706;color:#fff;border-radius:99px;padding:4px 10px;font-size:9px;font-weight:700;">الكل</div>
          <div style="background:#F5F5F5;color:#525252;border-radius:99px;padding:4px 10px;font-size:9px;font-weight:700;">تدريب</div>
          <div style="background:#F5F5F5;color:#525252;border-radius:99px;padding:4px 10px;font-size:9px;font-weight:700;">عقد دائم</div>
        </div>
        <div class="card" style="display:flex;align-items:stretch;padding:0;overflow:hidden;"><div style="width:3px;background:#8B5CF6;flex-shrink:0;"></div><div style="flex:1;padding:8px 9px 8px 7px;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:28px;height:28px;border-radius:8px;background:#8B5CF6;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;flex-shrink:0;">B</div><div style="flex:1;"><div class="lbl">مطوّر تطبيقات موبايل</div><div class="meta">BNM Tech · نواكشوط</div></div><div style="background:#DCFCE7;color:#16A34A;border-radius:99px;padding:2px 5px;font-size:8px;font-weight:800;">جديد</div></div><div style="display:flex;gap:4px;"><div class="pill" style="background:#8B5CF618;color:#8B5CF6;">تدريب</div><div class="pill" style="background:#F5F5F5;color:#525252;">معلوماتية</div></div></div></div>
        <div class="card" style="display:flex;align-items:stretch;padding:0;overflow:hidden;"><div style="width:3px;background:#059669;flex-shrink:0;"></div><div style="flex:1;padding:8px 9px 8px 7px;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:28px;height:28px;border-radius:8px;background:#059669;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;flex-shrink:0;">M</div><div style="flex:1;"><div class="lbl">محاسب مالي</div><div class="meta">Mauritel · نواكشوط</div></div></div><div style="display:flex;gap:4px;"><div class="pill" style="background:#D1FAE5;color:#059669;">دائم</div><div class="pill" style="background:#FEF3C7;color:#D97706;">⏰ 30 أبريل</div></div></div></div>
        <div class="card" style="display:flex;align-items:stretch;padding:0;overflow:hidden;"><div style="width:3px;background:#3B82F6;flex-shrink:0;"></div><div style="flex:1;padding:8px 9px 8px 7px;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:28px;height:28px;border-radius:8px;background:#3B82F6;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;flex-shrink:0;">S</div><div style="flex:1;"><div class="lbl">مهندس شبكات</div><div class="meta">SOMELEC · نواكشوط</div></div><div style="background:#DCFCE7;color:#16A34A;border-radius:99px;padding:2px 5px;font-size:8px;font-weight:800;">جديد</div></div><div style="display:flex;gap:4px;"><div class="pill" style="background:#DBEAFE;color:#3B82F6;">محدد المدة</div><div class="pill" style="background:#F5F5F5;color:#525252;">هندسة</div></div></div></div>
      </div>
      <div class="bot-nav"><div class="nb">🏠</div><div class="nc">＋</div><div class="nb">👤</div></div>
    </div></div>
  </div>
  <div class="bot">
    <div class="h1" style="font-size:42px;">فرص<br>العمل<br>لك</div>
    <div class="sub">وظائف وتدريب للطلاب الموريتانيين</div>
  </div>
</div>

<!-- 07 PROFILE -->
<div class="shot bg-emerald">
  <div class="top">
    <div class="eyebrow">الملف الشخصي</div>
    <div class="h1">تتبّع<br>تقدّمك<br>يومياً</div>
    <div class="sub">نقاط XP · مستويات · شارات الإنجاز</div>
  </div>
  <div class="fcard" style="top:60px;left:24px;">
    <div class="fc-icon">🥇</div>
    <div><div class="fc-title">المستوى 3 — متقدم</div><div class="fc-sub">340 / 500 XP</div></div>
  </div>
  <div class="phone-wrap">
    <div class="phone"><div class="pscreen">
      <div class="sb" style="background:linear-gradient(135deg,#14B8A6,#047857);color:#fff;"><span style="font-size:12px;font-weight:800;">09:41</span><span>📶 🔋</span></div>
      <div style="background:linear-gradient(135deg,#14B8A6,#047857);padding:10px 14px 18px;text-align:center;position:relative;overflow:hidden;flex-shrink:0;">
        <div style="position:absolute;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.06);top:-30px;right:-20px;"></div>
        <div style="width:50px;height:50px;border-radius:25px;background:rgba(255,255,255,0.18);border:3px solid rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:900;color:#fff;margin:0 auto 7px;">أ</div>
        <div style="font-size:14px;font-weight:900;color:#fff;">أحمد ولد محمد</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.60);margin-top:2px;">جامعة نواكشوط · علوم · س3</div>
        <div style="display:flex;justify-content:center;gap:5px;margin-top:6px;">
          <div style="background:rgba(255,255,255,0.14);border-radius:99px;padding:3px 8px;font-size:9px;color:#fff;font-weight:700;">🥇 متقدم</div>
          <div style="background:rgba(253,212,76,0.20);border-radius:99px;padding:3px 8px;font-size:9px;color:#FDE68A;font-weight:700;">⭐ 340 XP</div>
        </div>
        <div style="background:rgba(255,255,255,0.18);border-radius:99px;height:5px;margin:7px 18px 0;">
          <div style="width:68%;height:5px;border-radius:99px;background:#FDE68A;"></div>
        </div>
        <div style="font-size:8px;color:rgba(255,255,255,0.50);margin-top:3px;">340 / 500 XP للمستوى 4</div>
      </div>
      <div style="padding:0 13px;overflow:hidden;flex:1;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #F0F0F0;margin-bottom:7px;">
          <div style="text-align:center;padding:7px 0;"><div style="font-size:15px;font-weight:900;color:#0D9488;">12</div><div style="font-size:8px;color:#A3A3A3;">رفعت</div></div>
          <div style="text-align:center;padding:7px 0;border-left:1px solid #F0F0F0;border-right:1px solid #F0F0F0;"><div style="font-size:15px;font-weight:900;color:#0D9488;">89</div><div style="font-size:8px;color:#A3A3A3;">نزّلت</div></div>
          <div style="text-align:center;padding:7px 0;"><div style="font-size:15px;font-weight:900;color:#0D9488;">7🔥</div><div style="font-size:8px;color:#A3A3A3;">متتالي</div></div>
        </div>
        <div style="font-size:10px;font-weight:800;color:#0A0A0A;margin-bottom:5px;">الشارات</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px;">
          <div style="background:#FEF3C7;color:#D97706;border-radius:9px;padding:4px 8px;font-size:10px;font-weight:700;">🏅 أول رفع</div>
          <div style="background:#EDE9FE;color:#7C3AED;border-radius:9px;padding:4px 8px;font-size:10px;font-weight:700;">🃏 مراجع</div>
          <div style="background:#FFF7ED;color:#EA580C;border-radius:9px;padding:4px 8px;font-size:10px;font-weight:700;">🔥 أسبوع</div>
          <div style="background:#ECFDF5;color:#059669;border-radius:9px;padding:4px 8px;font-size:10px;font-weight:700;">📚 قارئ</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #F5F5F5;">
          <div style="display:flex;align-items:center;gap:6px;"><span style="font-size:13px;">🔔</span><div style="font-size:11px;font-weight:600;color:#0A0A0A;">الإشعارات</div></div>
          <div style="width:30px;height:17px;border-radius:9px;background:#0D9488;display:flex;align-items:center;justify-content:flex-end;padding:2px;"><div style="width:13px;height:13px;border-radius:7px;background:#fff;"></div></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <div style="display:flex;align-items:center;gap:6px;"><span style="font-size:13px;">⭐</span><div style="font-size:11px;font-weight:600;color:#0A0A0A;">الاشتراك المميز</div></div>
          <div style="background:linear-gradient(90deg,#14B8A6,#F59E0B);color:#fff;border-radius:99px;padding:3px 8px;font-size:9px;font-weight:700;">مميز</div>
        </div>
      </div>
      <div class="bot-nav"><div class="nb">🏠</div><div class="nc">＋</div><div class="nb on">👤</div></div>
    </div></div>
  </div>
</div>

<!-- 08 LOGIN -->
<div class="shot bg-dark">
  <div class="top" style="display:flex;flex-direction:column;gap:14px;">
    <div style="width:76px;height:76px;border-radius:22px;background:linear-gradient(135deg,#1ABFB0,#065F59);border:2px solid rgba(255,255,255,0.20);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 26px rgba(13,148,136,0.55);overflow:hidden;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;bottom:50%;background:linear-gradient(180deg,rgba(255,255,255,0.18) 0%,transparent 100%);"></div>
      <div style="position:absolute;top:8px;right:8px;width:10px;height:10px;border-radius:50%;background:#FDE68A;"></div>
      <svg width="44" height="44" viewBox="0 0 90 90" style="position:relative;">
        <defs><linearGradient id="gn2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#FDE68A"/><stop offset="100%" stop-color="#F59E0B"/></linearGradient></defs>
        <circle cx="45" cy="45" r="33" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="2"/>
        <line x1="45" y1="12" x2="45" y2="19" stroke="rgba(255,255,255,0.55)" stroke-width="3" stroke-linecap="round"/>
        <line x1="78" y1="45" x2="71" y2="45" stroke="rgba(255,255,255,0.28)" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="45" y1="78" x2="45" y2="71" stroke="rgba(255,255,255,0.28)" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="12" y1="45" x2="19" y2="45" stroke="rgba(255,255,255,0.28)" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M45,19 L50,42 L45,46 L40,42 Z" fill="url(#gn2)"/>
        <path d="M45,71 L48,49 L45,45 L42,49 Z" fill="rgba(255,255,255,0.35)"/>
        <circle cx="45" cy="45" r="4.5" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.8"/>
        <circle cx="45" cy="45" r="2.5" fill="url(#gn2)"/>
      </svg>
    </div>
    <div class="h1">Studara</div>
    <div class="sub">رفيقك في المسيرة الجامعية</div>
    <div class="chips">
      <div class="chip">📚 موارد</div><div class="chip">📅 جدول</div>
      <div class="chip">🃏 بطاقات</div><div class="chip">💼 وظائف</div>
    </div>
  </div>
  <div class="phone-wrap" style="bottom:-16px;">
    <div class="phone"><div class="pscreen">
      <div class="sb" style="background:linear-gradient(135deg,#14B8A6,#065F59);color:#fff;"><span style="font-size:12px;font-weight:800;">09:41</span><span>📶 🔋</span></div>
      <div style="background:linear-gradient(135deg,#14B8A6,#065F59);padding:14px 14px 22px;position:relative;overflow:hidden;flex-shrink:0;margin-top:-10px;">
        <div style="position:absolute;width:150px;height:150px;border-radius:75px;background:rgba(255,255,255,0.06);top:-55px;right:-45px;"></div>
        <div style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.14);border-radius:99px;padding:3px 9px;font-size:8px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:1px;margin-bottom:10px;">
          <div style="width:5px;height:5px;border-radius:50%;background:#FDE68A;"></div>٠١ — تسجيل الدخول
        </div>
        <div style="display:flex;align-items:center;gap:9px;">
          <div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.22);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🧭</div>
          <div><div style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.8px;line-height:1;">Studara</div><div style="font-size:9px;color:rgba(255,255,255,0.55);margin-top:1px;">منصة الطالب</div></div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:9px;">
          <div style="background:rgba(255,255,255,0.12);border-radius:99px;padding:3px 8px;font-size:8px;color:rgba(255,255,255,0.80);font-weight:600;">📚 موارد</div>
          <div style="background:rgba(255,255,255,0.12);border-radius:99px;padding:3px 8px;font-size:8px;color:rgba(255,255,255,0.80);font-weight:600;">📅 جدول</div>
          <div style="background:rgba(255,255,255,0.12);border-radius:99px;padding:3px 8px;font-size:8px;color:rgba(255,255,255,0.80);font-weight:600;">💼 وظائف</div>
        </div>
      </div>
      <div style="background:#fff;border-radius:18px 18px 0 0;margin-top:-10px;padding:9px 13px 10px;flex:1;overflow:hidden;">
        <div style="width:26px;height:3px;border-radius:2px;background:#EFEFEF;margin:0 auto 8px;"></div>
        <div style="font-size:15px;font-weight:800;color:#0A0A0A;margin-bottom:2px;">أهلاً بعودتك 👋</div>
        <div style="font-size:10px;color:#A3A3A3;margin-bottom:9px;">سجّل دخولك للوصول إلى مواردك.</div>
        <div style="background:#FAFAFA;border:1.5px solid #EFEFEF;border-radius:9px;padding:7px 9px;display:flex;align-items:center;gap:5px;margin-bottom:6px;font-size:10px;color:#A3A3A3;">✉️ example@una.mr</div>
        <div style="background:#FAFAFA;border:1.5px solid #EFEFEF;border-radius:9px;padding:7px 9px;display:flex;align-items:center;gap:5px;margin-bottom:7px;font-size:10px;color:#A3A3A3;">🔒 ••••••••</div>
        <div style="text-align:left;font-size:9px;color:#0D9488;font-weight:600;margin-bottom:8px;">نسيت كلمة المرور؟</div>
        <div style="background:linear-gradient(90deg,#14B8A6,#0D9488);border-radius:99px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:11px;font-weight:800;color:#fff;flex:1;text-align:center;">تسجيل الدخول</div>
          <div style="width:20px;height:20px;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;color:#0D9488;">←</div>
        </div>
        <div style="text-align:center;margin-top:8px;font-size:9px;color:#A3A3A3;">ليس لديك حساب؟ <span style="color:#0D9488;font-weight:800;">إنشاء حساب</span></div>
      </div>
    </div></div>
  </div>
</div>

</div>
<p style="text-align:center;color:rgba(255,255,255,0.22);font-size:12px;margin-top:48px;">Studara · App Store &amp; Google Play · 390×844</p>
</body>
</html>"""

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(HTML)
print(f"Written {len(HTML)} chars to {TARGET}")
