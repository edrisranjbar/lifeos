<div align="center">

# Edi Life OS

**عادت‌ها، هدف‌ها، تمرکز، پول و پروژه‌هایتان در یک داشبورد شخصی روی سرور خودتان؛ داشبوردی که دستیار هوش مصنوعی‌تان هم می‌تواند از آن استفاده کند.**

[![آخرین نسخه](https://img.shields.io/github/v/release/edrisranjbar/lifeos?color=39e6ad)](https://github.com/edrisranjbar/lifeos/releases) [![ستاره‌های گیت‌هاب](https://img.shields.io/github/stars/edrisranjbar/lifeos?style=flat&color=f3c969)](https://github.com/edrisranjbar/lifeos/stargazers) [![مجوز MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Docker](https://img.shields.io/badge/docker-compose_up-2496ed?logo=docker&logoColor=white)](#نصب-با-داکر-پیشنهادی) [![سرور MCP](https://img.shields.io/badge/MCP-15_tools-39e6ad)](#هوش-مصنوعی-و-mcp) [![PHP 8.1+](https://img.shields.io/badge/PHP-8.1%2B-777bb4?logo=php&logoColor=white)](#موارد-لازم)

**[وب‌سایت](https://edrisranjbar.github.io/lifeos/fa/)** · [شروع سریع](#شروع-سریع) · [گشتی کوتاه](#گشتی-کوتاه) · [هوش مصنوعی](#هوش-مصنوعی-و-mcp) · [حمایت مالی](#حمایت-مالی) · [تماس](#تماس) · **[English](README.md)** · **[Español](README.es.md)**

<br>

<img src="docs/media/demo.gif" alt="نمایش: تیک زدن یک عادت در Habittify، درخواست از Claude برای ثبت هزینهٔ ۴۶ دلاری ناهار از طریق سرور MCP، و نمایش هزینهٔ جدید در بخش مالی" width="100%">

<sub>یک عادت را تیک بزنید، از Claude بخواهید هزینه‌ای ثبت کند و ببینید که در بخش مالی ثبت می‌شود. هزینه از طریق API واقعی و با داده‌های نمونه ثبت شده است.</sub>

</div>

<br>

بیشتر ما زندگی‌مان را بین یک برنامهٔ کارها، یک ردیاب عادت، یک فایل اکسل بودجه، یک تایمر پومودورو و یک برنامهٔ یادداشت تقسیم کرده‌ایم و هیچ‌کدام از این‌ها با هم حرف نمی‌زنند. **Edi Life OS همه را در یک داشبورد آرام و خصوصی جمع می‌کند** و کارهای کوچک امروز را به مسیری که برای زندگی‌تان می‌خواهید وصل می‌کند.

- **همه چیز در یک جا.** یازده فضای کاری با یک طراحی، یک ورود و یک پایگاه داده.
- **به هم وصل، نه فقط کنار هم.** عادت‌ها پیشرفت هدف‌ها را جلو می‌برند، کارت‌های کانبان در تقویم دیده می‌شوند و نمای کلی، امتیاز روزانهٔ شما را حساب می‌کند.
- **مال خودتان.** روی هر هاست PHP و MySQL اجرا می‌شود، حتی هاست اشتراکی ارزان. بدون اشتراک ماهانه، بدون ردیابی و بدون وابستگی به یک شرکت.
- **آمادهٔ هوش مصنوعی.** با سرور MCP داخلی، Claude و دستیارهای دیگر می‌توانند داشبوردتان را بخوانند، هدف بچینند، عادت ثبت کنند و هزینه‌ها را برایتان ثبت کنند.
- **فارسی‌دوست.** تاریخ‌ها به وقت تهران، تقویم جلالی (شمسی) در Habittify، ارز پیش‌فرض تومان و نوشتن راست‌به‌چپ در یادداشت‌ها.

> [!TIP]
> اگر Edi Life OS به کارتان آمد، دادن یک ⭐ در گیت‌هاب کمک می‌کند دیگران هم آن را پیدا کنند.

## گشتی کوتاه

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/dashboard.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/dashboard-light.webp">
  <img src="docs/media/dashboard.webp" alt="نمای کلی Edi Life OS: امتیاز بهره‌وری روزانه با تمرکز، عادت‌ها، هدف‌ها و ابعاد زندگی" width="100%">
</picture>
<p><b>نمای کلی</b>: امتیازی روزانه که از تمرکز، عادت‌ها، هدف‌ها و کارهایتان ساخته می‌شود، به همراه نگاهی سریع به شش بُعد زندگی‌تان.</p>

<table>
<tr>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/growth.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/growth-light.webp">
  <img src="docs/media/growth.webp" alt="فضای رشد با شش بُعد زندگی و هدف‌های SMART">
</picture>
<p><b>رشد</b>: شش بُعد زندگی که به هدف‌های بلندمدت، هدف‌های SMART، عادت‌ها و کارها وصل‌اند؛ با مرورهای هفتگی، ماهانه و فصلی.</p>
</td>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/focus.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/focus-light.webp">
  <img src="docs/media/focus.webp" alt="تایمر تمرکز روی منظره‌ای تصویرسازی‌شده همراه با پنل موسیقی">
</picture>
<p><b>تمرکز</b>: جلسه‌های پومودورو با استراحت، موسیقی پس‌زمینه و منظره‌ای که با ساعت روز تغییر می‌کند.</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/habittify.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/habittify-light.webp">
  <img src="docs/media/habittify.webp" alt="فهرست عادت‌ها با نمودار انجام هفت روز گذشته">
</picture>
<p><b>Habittify</b>: عادت‌های کوچک روزانه، زنجیرهٔ روزهای پیاپی و نمایش هفتگی پایبندی شما.</p>
</td>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/kanban.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/kanban-light.webp">
  <img src="docs/media/kanban.webp" alt="بورد کانبان با ستون‌های در صف، در حال انجام، بازبینی و انجام‌شده">
</picture>
<p><b>کانبان</b>: بوردهای پروژه با برچسب، اولویت، موعد، چک‌لیست، نظر و فایل پیوست.</p>
</td>
</tr>
</table>

<details>
<summary><b>همهٔ فضاهای کاری</b></summary>

<br>

| فضای کاری | چه کاری می‌توانید بکنید |
| --- | --- |
| **نمای کلی** | امتیاز بهره‌وری زنده، روند تمرکز و عادت‌ها، هدف‌ها، وضعیت مالی و پیش‌بینی هفت‌روزهٔ هوا. |
| **رشد** | وصل کردن شش بُعد زندگی به هدف‌های بلندمدت، هدف‌های SMART، عادت‌ها و کارها؛ با مرورهای دوره‌ای. [راهنما](docs/growth.md) |
| **تمرکز** | جلسه‌های زمان‌دار با استراحت کوتاه و بلند، تاریخچهٔ جلسه‌ها و موسیقی تمرکز. |
| **مالی** | هزینه‌ها، درآمدها و بودجه‌ها با ارزی که در تنظیمات انتخاب می‌کنید (پیش‌فرض: تومان). بدهی‌ها و طلب‌ها، یک‌باره یا تکرارشونده، که مستقیم در دفتر حساب ثبت می‌شوند. [راهنما](docs/financial-commitments.md) |
| **Habittify** | عادت‌های روزانه با ثبت انجام، زنجیره و پیشرفت ماهانه، با تقویم میلادی یا جلالی (قابل انتخاب در تنظیمات). |
| **کارها (Todo)** | کارهای روزمره با زیرکار، موعد، اولویت، توضیح و فهرست‌های شخصی. نماهای امروز، آینده و انجام‌شده، جست‌وجو و امکان بازگردانی. |
| **کانبان** | کارت‌ها و ستون‌های قابل جابه‌جایی با اولویت، برچسب، تاریخ، چک‌لیست، نظر و پیوست. هر کارت را می‌توان به یک هدف تبدیل کرد. |
| **تقویم** | کارت‌های موعددار و سررسیدهای مالی در نمای ماهانه یا برنامه. |
| **هدف‌ها** | هدف‌های SMART با معیار سنجش، موعد، اولویت و چک‌لیست، یا پیشرفتی که با یک عادت جلو می‌رود. |
| **دفترچه** | یادداشت‌های Markdown با پیش‌نمایش و خروجی گرفتن. متن فارسی و عربی خودکار راست‌به‌چپ نوشته می‌شود. |
| **یادداشت‌ها** | یادداشت‌های چسبان با رنگ، فونت و اتصال به هم. |

تاریخ‌ها بر اساس منطقهٔ زمانی **Asia/Tehran** هستند. کارت آب‌وهوا جزیرهٔ قشم را از طریق Open-Meteo نشان می‌دهد.

</details>

## هوش مصنوعی و MCP

Edi Life OS یک سرور اختیاری [MCP](https://modelcontextprotocol.io) دارد که **۱۵ ابزار** برای داشبورد، هدف‌ها، کارها، عادت‌ها، امور مالی و یادداشت‌ها در اختیار دستیار هوش مصنوعی قرار می‌دهد. آن را به Claude Desktop، Claude Code یا هر کلاینت MCP دیگری وصل کنید و به زبان ساده بپرسید:

> *«داشبورد LifeOS من را نشان بده.»*
>
> *«یک هدف SMART به اسم ساختن استودیوی خانگی با موعد سه ماه دیگر بساز و خرید پنل آکوستیک را به عنوان کار به آن اضافه کن.»*
>
> *«مطالعه را برای امروز انجام‌شده بزن.»*
>
> *«یک هزینهٔ ۴۵۰ هزار تومانی برای غذا ثبت کن و موجودی‌ام را بگو.»*

سرور MCP فقط از راه API محافظت‌شده با توکن با برنامه حرف می‌زند و هرگز به پایگاه داده یا رمزهای شما دسترسی ندارد. راه‌اندازی یک دقیقه طول می‌کشد؛ [راهنمای سرور MCP](mcp/README.md) (انگلیسی) را ببینید.

## شروع سریع

### نصب با داکر (پیشنهادی)

```sh
git clone https://github.com/edrisranjbar/lifeos.git && cd lifeos
cp .env.example .env    # set your sign-in and passwords
docker compose up -d
```

نشانی [localhost:8080](http://localhost:8080) را باز کنید و وارد شوید. MySQL، برنامه و فایل‌های پیوست هر کدام در volume جداگانه‌ای نگه داشته می‌شوند، پس بعد از `git pull` با اجرای `docker compose up -d --build` بدون از دست دادن داده به‌روزرسانی می‌کنید.

**بدون git و بدون build:** ایمیج آماده را اجرا کنید (برای amd64 و arm64، پس روی Raspberry Pi هم کار می‌کند).

```sh
curl -fsSLO https://raw.githubusercontent.com/edrisranjbar/lifeos/main/docker-compose.image.yml
curl -fsSL https://raw.githubusercontent.com/edrisranjbar/lifeos/main/.env.example -o .env   # then set your sign-in and passwords
docker compose -f docker-compose.image.yml up -d
```

### روی هاست اشتراکی

فایل `lifeos-<version>.zip` را از [آخرین نسخه](https://github.com/edrisranjbar/lifeos/releases/latest) دانلود کنید و در **پوشهٔ اصلی هاست** (یک سطح بالاتر از public_html) از حالت فشرده خارج کنید تا `public_html/` ریشهٔ وب باشد و بک‌اند امن بالای آن بماند. فایل `config.example.php` را به `config.php` کپی کنید، اطلاعات MySQL را وارد کنید و سایت را باز کنید. جزئیات در [راهنمای استقرار](docs/deployment.md) (انگلیسی) آمده است.

### اجرای محلی با PHP

به **PHP 8.1 یا بالاتر** (با `pdo_mysql` و `mbstring`) و **MySQL 8 یا بالاتر** (یا MariaDB 10.4 به بالا) نیاز دارید.

```sh
git clone https://github.com/edrisranjbar/lifeos.git
cd lifeos
cp config.example.php config.php   # PowerShell: Copy-Item config.example.php config.php
```

فایل `config.php` را با اطلاعات پایگاه داده و نام کاربری و رمز دلخواهتان پر کنید و سرور را اجرا کنید:

```sh
php -S localhost:8000 -t public_html server.php
```

نشانی [localhost:8000](http://localhost:8000) را باز کنید و وارد شوید. پایگاه داده و جدول‌ها در اولین اجرا ساخته می‌شوند. از **تنظیمات ← حساب من** نام کاربری و رمز را عوض کنید و از **تنظیمات ← حساب‌ها** مدیرهای دیگری با فضای کاری خصوصی خودشان اضافه کنید.

> [!IMPORTANT]
> فایل‌های `config.php` و `.env` اطلاعات محرمانهٔ واقعی دارند و در gitignore هستند. هرگز آن‌ها را commit نکنید.

### موارد لازم

| بخش | نیازمندی |
| --- | --- |
| PHP | **8.1+** با `pdo_mysql` و `mbstring` |
| پایگاه داده | **MySQL 8+**؛ با MariaDB 10.4 هم آزمایش شده است |
| وب‌سرور | سرور داخلی PHP برای اجرای محلی؛ Apache با rewrite برای هاست |
| آب‌وهوا | افزونهٔ `curl` در PHP و دسترسی HTTPS به بیرون |
| سرور MCP | اختیاری: **Node.js 22.9+** |
| تست‌های API | اختیاری: `pdo_sqlite` |

## داده‌های شما مال خودتان است

- همه چیز در پایگاه دادهٔ MySQL **خودتان** ذخیره می‌شود.
- ذخیره‌ها با بررسی نسخه انجام می‌شوند، پس یک تب قدیمی نمی‌تواند بی‌صدا تغییرات جدیدتر را بازنویسی کند.
- از پایگاه داده، فایل‌های پیوست و تنظیمات با هم نسخهٔ پشتیبان بگیرید.

برای API، امنیت، ساختار پروژه و مستندات کامل، [README انگلیسی](README.md) را ببینید.

## حمایت مالی

اگر Edi Life OS برایتان مفید است، می‌توانید با حمایت مالی به ادامهٔ توسعهٔ آن کمک کنید.

- **[پرداخت با تومان (درگاه بانکی)](https://edrisranjbar.ir/donation)**
- [حمایت از طریق Donatr](https://donatr.ee/edicodes)
- رمزارز: نشانی‌های دریافت در [بخش Donations در README انگلیسی](README.md#donations) آمده است.

## تماس

برای پرسش، بازخورد یا همکاری به **[edris.qeshm2@gmail.com](mailto:edris.qeshm2@gmail.com)** ایمیل بزنید. برای گزارش باگ و پیشنهاد قابلیت، لطفاً [یک issue در گیت‌هاب](https://github.com/edrisranjbar/lifeos/issues/new/choose) باز کنید (فارسی هم اشکالی ندارد).

## مجوز

[MIT](LICENSE) © 2026 ادریس رنجبر. از آن استفاده کنید، fork کنید و رویش بسازید.

## مشارکت

ایده، گزارش باگ و pull request خوش‌آمد است. برای شروع [راهنمای مشارکت](CONTRIBUTING.md) را بخوانید و اگر دنبال یک نقطهٔ شروع هستید، سراغ برچسب [`good first issue`](https://github.com/edrisranjbar/lifeos/labels/good%20first%20issue) بروید.
