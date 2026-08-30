# Compliance

> Notas de trabajo, no asesoría legal. Antes de comercializar el paquete hay que
> validar todo esto con un abogado especializado en protección de datos.
> Conviene tratarlo como argumento de venta, no como fricción.

## Email comercial en España

La LSSI-CE es restrictiva con el correo comercial no solicitado.

**Decisiones de producto que reducen el riesgo:**

- Apuntar a **buzones genéricos de empresa** (`info@`, `contacto@`, `reservas@`).
  El dato de contacto de la persona física sí es dato personal bajo RGPD; el de
  la empresa como entidad tiene otro tratamiento.
- Identificación clara e inequívoca del remitente en cada envío.
- Mecanismo de baja funcional, gratuito y visible en cada mensaje.
- Lista de supresión global respetada en todas las campañas de todos los tenants.
- Registro de origen del dato por lead (fuente y fecha), para poder responder a
  cualquier reclamación.

## Fuentes de datos

- **Google Places API** — de pago, con ToS claros. Fuente principal.
- **Directorios y registros públicos** — revisar términos caso por caso.
- **Scraping de LinkedIn / Meta** — no. Va contra ToS, provoca baneos y ya nos
  bloqueó el proyecto del agregador.

## RRSS

Automatizar DMs o conexiones en LinkedIn/Meta va contra los términos de uso de
ambas plataformas. La vía sostenible es **ads**: audiencias personalizadas y
lookalike apuntando a las landings generadas.

Esto además reencuadra la promesa comercial: no vendemos "mensajes masivos",
vendemos captación medible.

## Pendiente

- [ ] Consulta con asesoría legal antes de Fase 4
- [ ] Redactar aviso de privacidad y DPA para nuestros clientes (somos encargados
      del tratamiento cuando ellos son responsables)
- [ ] Definir política de retención de leads no contactados
