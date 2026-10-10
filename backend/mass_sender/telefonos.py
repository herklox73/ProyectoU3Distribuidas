"""
Normalización de números de teléfono (formato E.164 sin el +).

Se usa en todos los puntos donde entra un número al sistema: agregar o
editar un contacto, importar un CSV, enviar desde el chat y enviar una
campaña. Así un número escrito como 0987654321, 987654321 o
+593 0987654321 siempre termina guardado como 593987654321, que es el
formato que necesita WhatsApp para entregar el mensaje.
"""
import re


def normalizar_telefono(raw):
    """
    Limpia y normaliza un número al formato E.164 sin el +.

    Reglas Ecuador (caso principal):
      - Móvil local  09XXXXXXXX  (10 dígitos)  → 5939XXXXXXXX  ✓
      - Fijo  02-07XXXXXXX        (8-9 dígitos) → RECHAZADO
      - Ya con código 5939XXXXXXXX (12 dígitos) → ✓
      - Ya con código 5932-5938XX               → RECHAZADO (fijo)

    Números internacionales (no Ecuador):
      - Deben tener mínimo 11 dígitos (código de país + número móvil).
        Ej: Colombia +573XXXXXXXXX (12d), EEUU +1XXXXXXXXXX (11d).
      - Números cortos sin código de país → RECHAZADOS.

    Devuelve (telefono_limpio, error_msg).  error_msg es None si está ok.
    """
    if not raw:
        return '', 'Teléfono vacío'

    raw_str = str(raw).strip()

    # 1. Detectar notación científica (ej: "1.3071E+12")
    if re.search(r'[Ee][+\-]?\d', raw_str):
        return '', 'Número en notación científica — revisa el formato del CSV'

    # 2. Quitar todo excepto dígitos y '+'
    limpio = re.sub(r'[^\d+]', '', raw_str)

    # 3. Quitar el + inicial si existe
    if limpio.startswith('+'):
        limpio = limpio[1:]

    # 4. Caracteres no numéricos que quedaron
    if not limpio.isdigit():
        return '', 'Teléfono contiene caracteres inválidos'

    # 4b. Errores comunes al escribir con el código ya puesto:
    #     +593 0987654321  ->  5930987654321  (el 0 inicial sobra)
    #     987654321        ->  móvil de Ecuador sin el 0 ni el código
    if re.match(r'^5930\d{9}$', limpio):
        limpio = '593' + limpio[4:]
    elif re.match(r'^9\d{8}$', limpio):
        limpio = '593' + limpio

    # 5. Número local Ecuador (empieza con 0, 8-10 dígitos)
    if re.match(r'^0\d{7,9}$', limpio):
        sin_cero = limpio[1:]
        if not sin_cero.startswith('9'):
            return '', (
                f'Número fijo ({limpio[:3]}...) — los fijos no reciben WhatsApp. '
                f'Los móviles ecuatorianos empiezan con 09XXXXXXXX.'
            )
        limpio = '593' + sin_cero  # → 5939XXXXXXXX (12 dígitos)

    # 6. Número con código Ecuador
    if limpio.startswith('593'):
        if not limpio.startswith('5939'):
            return '', (
                f'Número fijo de Ecuador ({limpio[:5]}...) — '
                f'los fijos no reciben WhatsApp. Solo móviles 5939XXXXXXXX.'
            )
        if len(limpio) != 12:
            return '', (
                f'Móvil Ecuador inválido: {len(limpio)} dígitos '
                f'(se esperan exactamente 12: 5939XXXXXXXX).'
            )
        return limpio, None   # ✓ Ecuatoriano válido

    # 7. Número internacional (no Ecuador)
    #    Mínimo 11 dígitos: código de país (1-3 d) + número móvil (8+ d)
    #    Máximo 15 dígitos (límite E.164)
    if len(limpio) < 11:
        return '', (
            f'Número demasiado corto ({len(limpio)} dígitos). '
            f'Para Ecuador usa 09XXXXXXXX. '
            f'Para otros países incluye el código de país (ej: 573... Colombia, 1... EEUU).'
        )
    if len(limpio) > 15:
        return '', f'Número demasiado largo ({len(limpio)} dígitos, máximo 15).'

    return limpio, None


def normalizar_o_igual(raw):
    """Devuelve el número normalizado, o el original si no se pudo normalizar."""
    tel, err = normalizar_telefono(raw)
    return tel if not err else str(raw or '').strip()
