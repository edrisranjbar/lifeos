<div align="center">

# Edi Life OS

**Tus hábitos, objetivos, concentración, finanzas y proyectos en un panel autoalojado que tu asistente de IA también puede utilizar.**

[![Última versión](https://img.shields.io/github/v/release/edrisranjbar/lifeos?color=39e6ad)](https://github.com/edrisranjbar/lifeos/releases) [![Estrellas en GitHub](https://img.shields.io/github/stars/edrisranjbar/lifeos?style=flat&color=f3c969)](https://github.com/edrisranjbar/lifeos/stargazers) [![Licencia MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Docker](https://img.shields.io/badge/docker-compose_up-2496ed?logo=docker&logoColor=white)](#con-docker-recomendado) [![Servidor MCP](https://img.shields.io/badge/MCP-15_tools-39e6ad)](#conversa-con-tu-life-os-con-ia) [![PHP 8.1+](https://img.shields.io/badge/PHP-8.1%2B-777bb4?logo=php&logoColor=white)](#requisitos)

**[Sitio web](https://edrisranjbar.github.io/lifeos/)** · [Inicio rápido](#inicio-rápido) · [Recorrido](#un-recorrido-rápido) · [IA / MCP](#conversa-con-tu-life-os-con-ia) · [Despliegue](docs/deployment.md) · [API](docs/api.md) · **[English](README.md)** · **[فارسی](README.fa.md)**

<br>

<img src="docs/media/demo.gif" alt="Demostración: marcar un hábito en Habittify, pedirle a Claude registrar un gasto de $46 mediante MCP, y ver aparecer el gasto en Finanzas" width="100%">

<sub>Marca un hábito, pídele a Claude registrar un gasto y míralo reflejado en Finanzas. El gasto se procesa a través de la API real con datos de muestra.</sub>

</div>

<br>

La mayoría de nosotros gestionamos nuestras vidas repartidas entre una aplicación de tareas pendientes, un registro de hábitos, una hoja de cálculo de presupuestos, un temporizador Pomodoro y una aplicación de notas, y ninguna de ellas se comunica con las demás. **Edi Life OS reúne todo en un panel sereno y privado**, conectando las pequeñas acciones de hoy con el rumbo que deseas darle a tu vida.

- **Todo en un solo lugar.** Diez espacios de trabajo comparten un diseño unificado, un inicio de sesión único y una sola base de datos.
- **Conectado, no solo acumulado.** Los hábitos impulsan tus metas, las tarjetas de Kanban se reflejan en el calendario, y la Vista general calcula una puntuación diaria global.
- **Tuyo.** Funciona en cualquier alojamiento PHP + MySQL, incluso en servidores compartidos económicos. Sin suscripciones, sin rastreo ni dependencia de proveedores.
- **Preparado para IA.** Un servidor MCP integrado permite que Claude y otros asistentes lean tu panel, planifiquen objetivos, registren hábitos y controlen gastos por ti.

> [!TIP]
> Si Edi Life OS te resulta útil, dejar una ⭐ en GitHub ayuda a que otros lo descubran.

## Un recorrido rápido

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/dashboard.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/dashboard-light.webp">
  <img src="docs/media/dashboard.webp" alt="Vista general de Edi Life OS: puntuación de productividad diaria con enfoque, hábitos, objetivos y dimensiones de vida" width="100%">
</picture>
<p><b>Vista general</b> — Una puntuación diaria calculada a partir de tu enfoque, hábitos, metas y trabajo, junto con tus seis dimensiones de vida de un vistazo.</p>

<table>
<tr>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/growth.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/growth-light.webp">
  <img src="docs/media/growth.webp" alt="Espacio de Crecimiento con seis dimensiones y objetivos SMART">
</picture>
<p><b>Crecimiento</b> — Seis dimensiones de vida vinculadas a objetivos a largo plazo, metas SMART, hábitos y tareas. Revisiones semanales, mensuales y trimestrales guiadas.</p>
</td>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/focus.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/focus-light.webp">
  <img src="docs/media/focus.webp" alt="Temporizador de enfoque sobre paisaje ilustrado con panel de música">
</picture>
<p><b>Enfoque</b> — Sesiones Pomodoro con descansos, banda sonora integrada y un paisaje que acompaña la hora del día.</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/habittify.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/habittify-light.webp">
  <img src="docs/media/habittify.webp" alt="Lista de hábitos con gráfica de cumplimiento de siete días">
</picture>
<p><b>Habittify</b> — Pequeños hábitos diarios, rachas y una visualización semanal de tu constancia.</p>
</td>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/kanban.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/kanban-light.webp">
  <img src="docs/media/kanban.webp" alt="Tablero Kanban con columnas de pendientes, en progreso, revisión y completado">
</picture>
<p><b>Kanban</b> — Tableros con etiquetas, prioridades, fechas límite, listas de comprobación, comentarios y adjuntos.</p>
</td>
</tr>
</table>

<details>
<summary><b>Los diez espacios de trabajo</b></summary>

<br>

| Espacio de trabajo | Lo que puedes hacer |
| --- | --- |
| **Vista general** | Puntuación de productividad en tiempo real, tendencias de enfoque y hábitos, metas, finanzas y pronóstico del tiempo para siete días. |
| **Crecimiento** | Vincula seis dimensiones vitales con metas a largo plazo, objetivos SMART, hábitos y tareas. Revisiones periódicas. [Guía](docs/growth.md) |
| **Enfoque** | Sesiones temporizadas con descansos cortos y largos, historial de sesiones y música de fondo. |
| **Finanzas** | Gastos, ingresos y presupuestos en la divisa que elijas en Configuración. Deudas y cobros pendientes registrados directamente en el balance. [Guía](docs/financial-commitments.md) |
| **Habittify** | Hábitos diarios con seguimiento de cumplimiento, rachas y progreso mensual. |
| **Todo** | Tareas diarias con subtareas, fechas límite, prioridades, descripciones y listas propias. Vistas Hoy, Próximas y Completadas, búsqueda y opción de deshacer. |
| **Kanban** | Tarjetas y listas con prioridades, etiquetas, fechas, subtareas, comentarios y archivos adjuntos. |
| **Calendario** | Tarjetas y compromisos financieros con fecha límite en vista mensual o de agenda. |
| **Objetivos** | Metas SMART con métricas, fechas límite, prioridades o avance impulsado por hábitos. |
| **Bloc de notas** | Notas en Markdown con vista previa y exportación. Compatible con escritura RTL y LTR. |
| **Notas adhesivas** | Notas rápidas con colores, tipografías y conexiones visuales. |

Las fechas siguen la zona horaria **Asia/Tehran**. El tiempo atmosférico muestra la Isla de Qeshm mediante Open-Meteo.

</details>

## Conversa con tu Life OS con IA

Edi Life OS incluye un servidor opcional de [MCP](https://modelcontextprotocol.io) que expone **15 herramientas** sobre tu panel, metas, tareas, hábitos, finanzas y notas. Conéctalo a Claude Desktop, Claude Code o cualquier cliente MCP y formula peticiones en lenguaje natural:

> *"Muéstrame el panel de LifeOS."*
>
> *"Crea un objetivo SMART llamado Construir un estudio en casa para dentro de tres meses y añade Comprar paneles acústicos como tarea."*
>
> *"Marca Lectura como completada hoy."*
>
> *"Registra un gasto de 450.000 Toman en comida y muestra mi saldo."*

El servidor MCP se comunica con tu instalación únicamente a través de la API HTTP protegida por token. Nunca accede directamente a tu base de datos ni a tus contraseñas. La configuración toma un minuto: consulta la [guía del servidor MCP](mcp/README.md) (en inglés).

## Inicio rápido

### Con Docker (recomendado)

```sh
git clone https://github.com/edrisranjbar/lifeos.git && cd lifeos
cp .env.example .env    # define tu usuario y contraseñas
docker compose up -d
```

Abre [localhost:8080](http://localhost:8080) e inicia sesión. MySQL, la aplicación y los adjuntos se almacenan en volúmenes independientes, por lo que `docker compose up -d --build` tras un `git pull` actualiza la versión sin pérdida de datos.

### En alojamiento compartido

Descarga `lifeos-<version>.zip` desde la [última versión publicada](https://github.com/edrisranjbar/lifeos/releases/latest) y extráelo en el **directorio raíz de tu alojamiento**, de modo que `public_html/` sea la raíz web y el backend permanezca seguro por encima de ella. Copia `config.example.php` a `config.php`, completa los datos de MySQL y accede a tu sitio web. Consulta la [guía de despliegue](docs/deployment.md) para más detalles.

### Con PHP en local

Requiere **PHP 8.1+** (con `pdo_mysql` y `mbstring`) y **MySQL 8+** (o MariaDB 10.4+).

```sh
git clone https://github.com/edrisranjbar/lifeos.git
cd lifeos
cp config.example.php config.php   # PowerShell: Copy-Item config.example.php config.php
```

Edita `config.php` con los datos de tu base de datos y las credenciales deseadas, luego inicia el servidor:

```sh
php -S localhost:8000 -t public_html server.php
```

Abre [localhost:8000](http://localhost:8000) e inicia sesión. Las tablas se generan automáticamente en el primer uso.

### Requisitos

| Componente | Requisito |
| --- | --- |
| PHP | **8.1+** con `pdo_mysql` y `mbstring` |
| Base de datos | **MySQL 8+**; también probado con MariaDB 10.4 |
| Servidor web | Servidor integrado de PHP en local; Apache con reescrituras en producción |
| Clima | PHP `curl` y conexión saliente HTTPS |
| Servidor MCP | Opcional: **Node.js 22.9+** |
| Pruebas de API | Opcional: `pdo_sqlite` |

## Licencia

[MIT](LICENSE) © 2026 Edris Ranjbar. Úsalo, crea bifurcaciones y amplíalo.
