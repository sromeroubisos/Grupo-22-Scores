"""Planillas 327935 (Buenos Aires 62-0 Nordeste) y 327939 (Cordobesa 13-0 Tucumán) del Encuentro Femenino
de Selecciones de XV (30/10/2026) -> JSON de ficha-partido-local.ts.
Las sustituciones se emparejan a mano (la planilla las lista sueltas: 'Se retiró' / 'Ingresó').
Los minutos 1T 1 de la 327939 son los que asentó la mesa (sin reloj corrido): se cargan como vienen.
Uso: python build_327935_327939.py <salida.json>"""
import json, sys

def nom(s):
    a, _, b = s.partition(',')
    return (b.strip() + ' ' + a.strip()).strip() if b else a.strip()

def lado(slug, nombres):
    ns = [nom(n) for n in nombres]
    return {'nombre': slug,
            'titulares': [{'numero': i + 1, 'nombre': n} for i, n in enumerate(ns[:15])],
            'suplentes': [{'numero': i + 16, 'nombre': n} for i, n in enumerate(ns[15:])]}

# 327935 · Zona A
BUENOS_AIRES = ['Torres, Milagros', 'Sosa Quintana, Renata', 'Torres, Natalia', 'Rodriguez, Barbara', 'Toledo Pacher, Ludmila Elena',
    'Mercado, Melina', 'Luis, Morena Abril', 'Contreras, Camila Luna', 'Cappellani, Isabella', 'Rahmer Morgantini, Avril',
    'Charamone, Carolina', 'Altini, Cecilia', 'Alcaraz, Melina Rosa', 'Gervasio, Magali', 'Lecuona, Milagros', 'Tevez, Jimena Sofia',
    'Lugo, Iara', 'Rodriguez, Sol Josefina', 'Tachini, Aisha', 'Osorio, Rocio Sabrina', 'Cardoso, Yael', 'Lezcano, Antonella']
NORDESTE = ['Acevedo, Veronica Pamela', 'Gomez, Cristina Florencia', 'Alvarez, Nair Soledad', 'Alvares, Estefania', 'Goy, Ayelen Araceli',
    'Mesa, Eira Lelies Mikaela', 'Monzon, Alexandra', 'Siacia, Juana Celeste', 'Zacarias, Veronica Soledad', 'Ojeda, Melisa Silvana',
    'Verón, Sabrina Jaqueline', 'Ibañez, Agustina Antonella', 'Maidana, Marianela Rita Soledad', 'Villa, Guadalupe Del Carmen',
    'Gimenez, Claudia Noemi', 'Dure, Bibiana Patricia', 'Fernandez, Oriana Micaela', 'Monte, Maria Ayelen', 'Albornoz, Maira Carina',
    'Fernandez, Florencia', 'Gervazoni, Ludmila', 'Gomez, Nilda']
# 327939 · Zona B
CORDOBESA = ['Barrionuevo, Maira', 'Perez, Maite', 'Coronel Peralta, Milagros', 'Lopez Cejas, Maiara Abril', 'Quintero Chiesa, Ana Paula',
    'Baudoin, Constanza', 'Lopez, Melina', 'Gonzalez, Yamila', 'Trigo Alday, Brisa Nazarena', 'Birreto, Dana', 'Boca, Ludmila',
    'Borda, Brisa', 'Bergoglio Vamonde, Giuliana', 'Crosetto, Antonella', 'Velay Fossat, Mariel', 'Barrera, Yamila Liliana',
    'Roda, Rocio', 'Valdez, Agustina', 'Guazzini Campana, Ursula', 'Morro Fergola, Ema Lucia', 'Rieger, Ana', 'Quiroga, Celmira']
TUCUMAN = ['Cattaneo, Katherina', 'Cazorla, Rita Beatriz', 'Ramirez, Silvina', 'Ledesma, Paula', 'Bortolozzo, Geovana Andrea',
    'Grima, Aylen', 'Diaz, Sofía Abril', 'Slame, Antonella', 'Cardozo, Camila', 'Giardelli, Victoria', 'Campos Ruiz, Agostina',
    'Medina, Azul', 'Moreno, María Florencia', 'Serrano, Graciela Yanina', 'Romero, Teresa Abril', 'Robles, Candelaria',
    'Alvarez Costas, Camila', 'Leguizamon, Nahiara', 'Argañaraz, Nahir', 'Casola, Norién Candela', 'Romano, Candela', 'Iovane, Ursula']

def evs(*items):
    """items: (periodo, minuto, tipo, equipo, jugador[, sale]) -> eventos; 'substitution' lleva 'Entra: x' y el que sale."""
    out = []
    for it in items:
        per, mi, tipo, eq, jug = it[:5]
        if tipo == 'substitution':
            out.append({'minuto': mi, 'periodo': per, 'tipo': tipo, 'equipo': eq, 'jugador': nom(it[5]), 'detalle': 'Entra: ' + nom(jug)})
        else:
            out.append({'minuto': mi, 'periodo': per, 'tipo': tipo, 'equipo': eq, 'jugador': nom(jug), 'detalle': ''})
    out.sort(key=lambda e: (e['periodo'], e['minuto']))  # estable
    return out

def total(ev):
    t = {'local': 0, 'visitante': 0}
    for e in ev: t[e['equipo']] += {'try': 5, 'conversion': 2, 'penalty_goal': 3, 'drop_goal': 3}.get(e['tipo'], 0)
    return t

L, V = 'local', 'visitante'
p35 = evs(
    ('1T', 2, 'try', L, 'Altini, Cecilia'), ('1T', 2, 'conversion', L, 'Rahmer Morgantini, Avril'),
    ('1T', 9, 'try', L, 'Tachini, Aisha'), ('1T', 9, 'conversion', L, 'Rahmer Morgantini, Avril'),
    ('1T', 10, 'try', L, 'Luis, Morena Abril'), ('1T', 10, 'conversion', L, 'Sosa Quintana, Renata'),
    ('1T', 16, 'try', L, 'Lecuona, Milagros'), ('1T', 16, 'try', L, 'Tachini, Aisha'),
    ('1T', 16, 'conversion', L, 'Rahmer Morgantini, Avril'),
    ('2T', 0, 'substitution', V, 'Fernandez, Oriana Micaela', 'Acevedo, Veronica Pamela'),
    ('2T', 0, 'substitution', V, 'Gomez, Nilda', 'Verón, Sabrina Jaqueline'),
    ('2T', 5, 'substitution', V, 'Gervazoni, Ludmila', 'Villa, Guadalupe Del Carmen'),
    ('2T', 7, 'try', L, 'Rahmer Morgantini, Avril'), ('2T', 7, 'try', L, 'Luis, Morena Abril'),
    ('2T', 7, 'conversion', L, 'Rahmer Morgantini, Avril'),
    ('2T', 10, 'substitution', V, 'Fernandez, Florencia', 'Gimenez, Claudia Noemi'),
    ('2T', 12, 'try', L, 'Tachini, Aisha'), ('2T', 12, 'conversion', L, 'Rahmer Morgantini, Avril'),
    ('2T', 12, 'try', L, 'Luis, Morena Abril'), ('2T', 12, 'try', L, 'Luis, Morena Abril'))
p39 = evs(
    ('1T', 1, 'try', L, 'Baudoin, Constanza'), ('1T', 1, 'try', L, 'Perez, Maite'),
    ('1T', 1, 'penalty_goal', L, 'Barrionuevo, Maira'))

partidos = [
    {'id': '19ce7063-d71b-41cf-9dea-d355a78abb1a', 'rotulo': 'Buenos Aires vs Nordeste · Zona A · planilla 327935', 'arbitro': 'Nerea Livoni',
     'local': lado('buenos-aires-femenino', BUENOS_AIRES), 'visitante': lado('nordeste-femenino', NORDESTE), 'eventos': p35, '_esperado': (62, 0)},
    {'id': '76ab7796-1d52-46b2-adcf-bbd932bda393', 'rotulo': 'Cordobesa vs Tucumán · Zona B · planilla 327939', 'arbitro': 'Viviana Garat',
     'local': lado('cordobesa-femenino', CORDOBESA), 'visitante': lado('tucuman-femenino', TUCUMAN), 'eventos': p39, '_esperado': (13, 0)},
]
for p in partidos:
    t = total(p['eventos'])
    print(p['rotulo'], 'eventos', t, 'esperado', p['_esperado'])
    assert (t['local'], t['visitante']) == p['_esperado']
    assert len(p['local']['titulares']) == 15 and len(p['local']['suplentes']) == 7
    assert len(p['visitante']['titulares']) == 15 and len(p['visitante']['suplentes']) == 7
    del p['_esperado']
json.dump({'descripcion': 'Encuentro Femenino de Selecciones de XV 2026 · planillas 327935, 327939', 'partidos': partidos},
          open(sys.argv[1], 'w', encoding='utf8'), ensure_ascii=False, indent=1)
