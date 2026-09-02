# KPK WO INTAKE — de work order a job, sin manos

Automatización de intake para work orders de Kirkplan Kitchens, más el guardián
de P.O. de Lowe's.

**Regla del owner que gobierna todo esto (2026-09-02):** *toda WO es un job
aprobado.* Una WO de Kirkplan no es un lead ni una propuesta. Llega ganada, así
que el intake crea el job en el momento en vez de esperar un paso de cierre.

---

## El problema que resuelve

Antes de esto, una WO de Kirkplan que entraba al inbox activaba exactamente una
cosa: tres etiquetas de Gmail. Nada más. Verificado sobre las tres últimas WO
(Becker 8/21, Wright 8/26, McClain 9/2) — las tres recibieron `Presiado`,
`Presiado/Contractors` y `WO-BOT-VISTO`, y nada más. Los jobs PH-2026-038 y
PH-2026-040 se crearon a mano después.

El costo real no era el trabajo manual. Era la cadena rota:

```
WO llega  →  [hueco]  →  número de job  →  P.O. en Lowe's  →  recibo archivado al job
              ▲
              └─ todo lo de la derecha dependía de que alguien se acordara
```

La cadena de la derecha **ya estaba armada y funciona**. Lowe's Pro lleva el
P.O. por todo el hilo de correos y el scanner de recibos lo archiva solo. Lo que
faltaba era el primer eslabón.

---

## Lo que hace ahora

### 1. Acuse de recibo — el único paso client-facing

Cada 5 minutos. Responde al PM que mandó la WO, en inglés, tono premium, sin
warranty stack (Kirkplan es B2B) y sin la palabra *Licensed* en ninguna forma.

Va **primero en prioridad**: el trabajo interno está envuelto en `try/catch`, así
que si falla la creación del job el acuse sale igual y el error se reporta. Un
acuse degradado es mejor que un inbox mudo.

Cuando el job sí se creó, el acuse lleva el número — que es el mismo P.O. que
Kirkplan verá en la factura, así les reconcilia limpio.

### 2. Creación del job

Bajo `LockService`, leyendo **JOBS y FIN_JOBS** antes de tomar el siguiente
número. No adivina: si no encuentra ningún `PH-YYYY-###` del año, se niega a
sembrar un número a ciegas. Ese es el control que faltaba en las colisiones
documentadas.

Crea después:

```
Active Projects/PH-2026-0XX_Apellido_Direccion/
  Documents/Work_Order_PH-2026-0XX.pdf
  Photos/  Receipts/  Invoices/
```

Y escribe la fila en JOBS **por nombre de columna**, no por posición — si el
tracker cambia de forma, el script no corrompe filas, salta el campo y lo
registra.

### 3. Dirección de la propiedad

La saca del PDF por OCR de Drive. Si el OCR falla o no encuentra una dirección
válida, escribe `[REQUIERE_REVISION]` y la carpeta queda como
`..._ADDRESS-PENDING`. **Nunca la deduce.** Una dirección inventada terminaría
en la carpeta, la factura y la entrega de material.

### 4. Guardián de P.O. de Lowe's

Cada hora. Lowe's Pro ya hace lo difícil: con el campo P.O. lleno, estampa
`PO#PH2026042` en el asunto de cada correo del pedido (orden, sustitución,
pickup, recibo) y lo imprime en el cuerpo del recibo. El scanner lo lee y
archiva el gasto contra el job. La rutina funciona — falla en silencio cuando el
campo queda vacío, y un campo vacío no se ve hasta el cierre de mes.

Verificado en Gmail, una sola semana:

| Pedido | P.O. | Resultado |
|---|---|---|
| 300901239260497837 (8/27) | `PH2026042` | archivado al job |
| 300901242260699185 (8/30) | ninguno | sin atribuir |
| 202933242262132999 (8/31) | ninguno | sin atribuir |

Dos de tres pedidos en tres días quedaron sin job. El guardián convierte ese
silencio en un aviso el mismo día — y el propio correo de Lowe's dice *"Click Go
To Order to add a PO to your order"*, así que atrapado a tiempo se arregla en la
fuente, no a mano en el ledger.

El aviso trae la lista de jobs abiertos con el P.O. ya formateado, listo para
copiar. Deduplica por número de pedido: un pedido genera hasta cuatro correos y
un aviso que repite cuatro veces se termina filtrando.

---

---

## El vigilante que ya existía

Script `automatizacion kirtplan kitchen OT`
(`137-gV7syJqVdWvti5wsicmGCkOnLyHtpi7jQNdyAfDma3N_hDNlV8by1`, en *Digital Tools
& Scripts*). Función única: `saveAttachmentsToSpecificClientFolders()`.

**Qué hace:** busca correos con adjunto de dos remitentes de Kirkplan, guarda
cada adjunto en una carpeta plana por remitente, filtra firmas y logos por
nombre de archivo, deduplica por nombre, y etiqueta el hilo
`Adjuntos Guardados - Directo`.

```
antonio.pinelli@kirkplankitchens.com → carpeta 1FKHro8YvZe8CrCowIk28WPM-H7wwSp-z
scanner@kirkplankitchens.com         → carpeta 1nyvGZznyyf9Yvo3keiED9ziYMO4sS9Lx
```

**Tres cosas que hay que saber:**

1. **Está callado desde el 2026-06-06.** El último archivo que guardó es
   `Smith, Marsha Drywall.pdf` de esa fecha. Los PDFs de Becker (8/21), Wright
   (8/26) y McClain (9/2) no están en la carpeta de Antonio. Antes de junio
   corría a diario y sin fallas — de octubre 2025 a junio 2026 hay archivos
   consecutivos. Si el trigger sigue instalado o no, no se ve desde fuera del
   proyecto de Apps Script; hay que abrirlo y mirar.

2. **No es el que pone `WO-BOT-VISTO`.** Este pone
   `Adjuntos Guardados - Directo`. Qué aplica `WO-BOT-VISTO` — que sí está en
   las tres WO recientes — no lo veo desde aquí.

3. **`scanner@kirkplankitchens.com` está muerto.** La doctrina lo marca como
   inexistente/bloqueado, y sigue en el mapa del script.

**Cómo conviven:** al terminar, el intake nuevo también estampa
`Adjuntos Guardados - Directo`. La consulta del vigilante excluye esa etiqueta,
así que si se revive nunca va a re-guardar una WO que este script ya archivó en
su carpeta de job. Un renglón, y dejan de pelearse.

Si además se quiere conservar el archivo plano por remitente, poner
`MIRROR_TO_LEGACY_ARCHIVE: true` en `Config.gs`. Por defecto está en `false`:
la carpeta del job es el lugar correcto para una WO, y el archivo plano no
atribuye nada.

---

## Formato del P.O. — importa

| Dónde | Formato | Ejemplo |
|---|---|---|
| Job Tracker, facturas a Kirkplan | con guiones | `PH-2026-042` |
| Campo P.O. en el checkout de Lowe's | sin guiones | `PH2026042` |

Es el mismo número. Lowe's es el que no lleva guiones, y así es como aparece de
vuelta en el asunto: `PO#PH2026042 - Your Sales Receipt`.

---

## Instalación

1. Abrir el proyecto de Apps Script (o crear uno nuevo desde
   [script.google.com](https://script.google.com)).
2. Copiar los tres `.gs` de esta carpeta: `Config.gs`, `KPK_WO_Intake.gs`,
   `LowesPoGuard.gs`.
3. **Servicios → Servicios avanzados de Google → activar `Drive API` (v2).**
   Sin esto el OCR de dirección no corre; el resto sí, y la dirección queda en
   `[REQUIERE_REVISION]`.
4. Ejecutar `installTriggers()` una vez. Crea las etiquetas e instala los dos
   triggers (5 min y 1 h).
5. Autorizar los permisos cuando lo pida (Gmail, Drive, Sheets).

### Estado al momento del commit (2026-09-02)

- La etiqueta `KPK/WO-Intake-Done` **ya está creada** y **ya está aplicada al hilo
  de McClain**. Ese acuse se mandó a mano hoy a las 12:35 ET; la etiqueta impide
  que el script lo vuelva a saludar en su primera corrida.
- Becker y Wright quedan fuera de la ventana de 7 días, así que no se tocan.
- Las etiquetas `KPK/WO-Intake-Error` y `Lowes/Missing-PO` las crea
  `installTriggers()`.
- **Falta el número de job de McClain.** No se puede asignar desde la superficie
  de chat (sin escritura en Sheets, y la regla exige leer JOBS + FIN_JOBS bajo
  lock). Lo asigna el script en la próxima WO, o Francisco a mano para esta.

### Ensayo antes de soltarlo

En `Config.gs`, poner `SIMULATE: true` y ejecutar `runKpkWoIntake()` a mano. Con
eso registra en el log exactamente qué escribiría, a quién respondería y con qué
número — sin tocar el sheet, Drive ni Gmail. Revisar el log, y recién entonces
volver a `false`.

---

## Etiquetas

| Etiqueta | Significado |
|---|---|
| `KPK/WO-Intake-Done` | Procesada. No se vuelve a tocar. |
| `KPK/WO-Intake-Error` | El acuse salió, el job no se creó. Quitar la etiqueta reintenta en la corrida siguiente. |
| `Lowes/Missing-PO` | Pedido de Lowe's sin P.O., ya avisado. |

`WO-BOT-VISTO` es de la automatización vieja de Kirkplan y queda intacta — este
script no la lee ni la escribe.

---

## Detección: qué cuenta como WO

Entrante de `@kirkplankitchens.com`, con adjunto PDF, asunto que nombra un
alcance (`drywall`, `paint`, `ceiling`, `texture`…), y que **no** sea respuesta
(`Re:`, `Fwd:`) ni correo de dinero (`invoice`, `statement`, `payment`, `COI`…).

Las tres WO observadas pasan el filtro: *Becker Drywall*, *Wright Drywall*,
*McClain Drywall and Paint*. El apellido se toma de las palabras antes del primer
término de alcance.

---

## Límites conocidos

- **El monto del contrato no se llena.** La WO trae presupuesto en el PDF, pero
  leerlo por OCR y escribirlo como `CONTRACT_AMOUNT` es exactamente el tipo de
  dato que no se rellena por plausibilidad. Queda vacío para que lo ponga
  Francisco.
- **No hay lista de materiales automática.** El script entrega el P.O. y la
  carpeta; qué comprar sigue siendo criterio de obra.
- **El pedido a Lowe's no se coloca solo.** Lowe's Pro no expone API de pedidos;
  la orden se arma en lowes.com. Lo que esto automatiza es el eslabón que
  faltaba (el P.O. existe antes del checkout) y la red que atrapa cuando se
  olvida.
- **`CLIENT_ID` de Kirkplan está fijo** en `CLT-2026-0006`, verificado contra las
  filas PH-2026-006 y PH-2026-008. Si Kirkplan cambia de client id hay que
  tocarlo en `Config.gs`.

---

## Nota de doctrina

La regla vigente dice que los `PH-YYYY-###` los asigna Code verificando JOBS +
FIN_JOBS, y que esta superficie no los inventa. Este script no rompe esa regla:
la implementa. Toma el número bajo lock, después de leer las dos fuentes
canónicas, y se niega a continuar si no puede leerlas. Lo que la regla prohíbe
es adivinar sin verificar — que es justo lo que originó las colisiones.

Lo que sí es nuevo y conviene que quede escrito: **el envío del acuse es
automático, sin gate de aprobación**, por decisión explícita del owner
(2026-09-02, *"el email de recibido es carpintería digital, no necesitas mi
aprobación"*). El resto de los correos client-facing sigue bajo la regla normal
de aprobación.
