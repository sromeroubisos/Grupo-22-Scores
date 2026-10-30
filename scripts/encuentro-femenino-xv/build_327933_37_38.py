"""Planillas 327937, 327938 y 327933 del Encuentro Femenino de Selecciones de XV (30/10/2026) -> JSON de ficha-partido-local.ts.
Las sustituciones se emparejan a mano (la planilla las lista sueltas: 'Se retiró' / 'Ingresó').
Los 'Se retiró' de Cuyo en 1T min 1 no tienen ingreso (ajuste previo de la formación): se omiten.
Uso: python build_327933_37_38.py <salida.json>"""
import json, sys

def nom(s):
    a, _, b = s.partition(',')
    return (b.strip() + ' ' + a.strip()).strip() if b else a.strip()

def lado(slug, nombres):
    ns = [nom(n) for n in nombres]
    return {'nombre': slug,
            'titulares': [{'numero': i + 1, 'nombre': n} for i, n in enumerate(ns[:15])],
            'suplentes': [{'numero': i + 16, 'nombre': n} for i, n in enumerate(ns[15:])]}

CUYO_327937 = ['Genco, Celeste Cecilia', 'Aguilar, Luciana', 'Castillo, Lourdes Marianela', 'Bertinatto, Priscila', 'Gil, Caterina Aldana',
    'Algañaras, Gabriela', 'Márquez, Pau', 'Etura José, Irupé', 'Vera Muñoz, Magdalena', 'Quiroga, María Lis', 'Palero, Guada',
    'Olivera Aldalla, Esmeralda Beatriz', 'Ditomassi, Candela', 'Garnica, Natasha', 'Verdejo, Valentina', 'Palleres, Julieta',
    'Migliore, Selene', 'Contreras, Amparo', 'Martínez Giaroli, Luz Camila', 'Terranova Gonzalez, María José',
    'Gomez Lopresti, Emilce Desirée', 'Lepez, Natalia']
CORDOBESA = ['Roda, Rocio', 'Barrera, Yamila Liliana', 'Valdez, Agustina', 'Guazzini Campana, Ursula', 'Quintero Chiesa, Ana Paula',
    'Morro Fergola, Ema Lucia', 'Lopez, Melina', 'Gonzalez, Yamila', 'Trigo Alday, Brisa Nazarena', 'Birreto, Dana', 'Boca, Ludmila',
    'Quiroga, Celmira', 'Bergoglio Vamonde, Giuliana', 'Rieger, Ana', 'Velay Fossat, Mariel', 'Perez, Maite', 'Barrionuevo, Maira',
    'Coronel Peralta, Milagros', 'Lopez Cejas, Maiara Abril', 'Baudoin, Constanza', 'Crosetto, Antonella', 'Borda, Brisa']
TUCUMAN = ['Cattaneo, Katherina', 'Cazorla, Rita Beatriz', 'Ramirez, Silvina', 'Ledesma, Paula', 'Bortolozzo, Geovana Andrea',
    'Grima, Aylen', 'Diaz, Sofía Abril', 'Slame, Antonella', 'Cardozo, Camila', 'Giardelli, Victoria', 'Campos Ruiz, Agostina',
    'Medina, Azul', 'Moreno, María Florencia', 'Serrano, Graciela Yanina', 'Romero, Teresa Abril', 'Robles, Candelaria',
    'Alvarez Costas, Camila', 'Leguizamon, Nahiara', 'Argañaraz, Nahir', 'Casola, Norién Candela', 'Romano, Candela', 'Iovane, Ursula']
CUYO_327938 = ['Genco, Celeste Cecilia', 'Aguilar, Luciana', 'Castillo, Lourdes Marianela', 'Bertinatto, Priscila', 'Gil, Caterina Aldana',
    'Algañaras, Gabriela', 'Márquez, Pau', 'Etura José, Irupé', 'Vera Muñoz, Magdalena', 'Quiroga, María Lis', 'Verdejo, Valentina',
    'Olivera Aldalla, Esmeralda Beatriz', 'Ditomassi, Candela', 'Gomez Lopresti, Emilce Desirée', 'Palero, Guada', 'Palleres, Julieta',
    'Migliore, Selene', 'Contreras, Amparo', 'Martínez Giaroli, Luz Camila', 'Terranova Gonzalez, María José',
    'Garnica, Natasha', 'Lepez, Natalia']
NORDESTE = ['Acevedo, Veronica Pamela', 'Gomez, Cristina Florencia', 'Alvarez, Nair Soledad', 'Alvares, Estefania', 'Goy, Ayelen Araceli',
    'Mesa, Eira Lelies Mikaela', 'Monzon, Alexandra', 'Siacia, Juana Celeste', 'Zacarias, Veronica Soledad', 'Ojeda, Melisa Silvana',
    'Verón, Sabrina Jaqueline', 'Ibañez, Agustina Antonella', 'Maidana, Marianela Rita Soledad', 'Villa, Guadalupe Del Carmen',
    'Gimenez, Claudia Noemi', 'Dure, Bibiana Patricia', 'Fernandez, Oriana Micaela', 'Monte, Maria Ayelen', 'Albornoz, Maira Carina',
    'Fernandez, Florencia', 'Gervazoni, Ludmila', 'Gomez, Nilda']
ALTO_VALLE = ['Benavidez, Daira', 'Morro Seguiel, Amy Fabiana', 'Zuñiga, Bianca Lujan', 'Banegas, Yesica', 'Farroni Reina, Florencia',
    'Guerci, Aldana Micaela', 'Sepúlveda, Ailin', 'Saez, Pia', 'Perea, Maria Pia', 'Nieva, María Florencia', 'Toledo, Florencia',
    'Gutierrez, Daniza', 'Esquivel, Pamela Florencia', 'Sandoval, Agustina Belén', 'Santana, Guadalupe', 'Guzman, Génesis',
    'Kristensen, Maria Candela', 'Roldán, Morena Agustina', 'Oyola, Yesica Cecilia', 'Sanchez Jara, Morena Paloma',
    'Sanhueza, Gianella', 'Velázquez Loncomán, Lucía Macarena']

def evs(*items):
    """items: (periodo, minuto, tipo, equipo, jugador[, sale]) -> eventos; 'substitution' lleva 'Entra: x' y el que sale."""
    out = []
    for it in items:
        per, mi, tipo, eq, jug = it[:5]
        if tipo == 'substitution':
            out.append({'minuto': mi, 'periodo': per, 'tipo': tipo, 'equipo': eq, 'jugador': nom(it[5]), 'detalle': 'Entra: ' + nom(jug)})
        else:
            out.append({'minuto': mi, 'periodo': per, 'tipo': tipo, 'equipo': eq, 'jugador': nom(jug),
                        'detalle': 'Juego sucio' if tipo == 'card_yellow' else ''})
    out.sort(key=lambda e: (e['periodo'], e['minuto']))  # estable
    return out

def total(ev):
    t = {'local': 0, 'visitante': 0}
    for e in ev: t[e['equipo']] += {'try': 5, 'conversion': 2, 'penalty_goal': 3, 'drop_goal': 3}.get(e['tipo'], 0)
    return t

L, V = 'local', 'visitante'
p37 = evs(
    ('1T', 1, 'card_yellow', L, 'Bertinatto, Priscila'),
    ('1T', 9, 'conversion', V, 'Birreto, Dana'), ('1T', 9, 'try', V, 'Velay Fossat, Mariel'),
    ('1T', 15, 'try', V, 'Gonzalez, Yamila'), ('1T', 20, 'try', V, 'Gonzalez, Yamila'),
    ('2T', 1, 'substitution', V, 'Barrionuevo, Maira', 'Valdez, Agustina'),
    ('2T', 1, 'substitution', V, 'Perez, Maite', 'Barrera, Yamila Liliana'),
    ('2T', 1, 'substitution', V, 'Coronel Peralta, Milagros', 'Roda, Rocio'),
    ('2T', 2, 'try', V, 'Borda, Brisa'),
    ('2T', 8, 'substitution', V, 'Lopez Cejas, Maiara Abril', 'Lopez, Melina'),
    ('2T', 8, 'substitution', V, 'Baudoin, Constanza', 'Bergoglio Vamonde, Giuliana'),
    ('2T', 13, 'conversion', V, 'Rieger, Ana'), ('2T', 13, 'try', V, 'Lopez Cejas, Maiara Abril'),
    ('2T', 17, 'try', V, 'Boca, Ludmila'))
p38 = evs(
    ('1T', 1, 'conversion', L, 'Giardelli, Victoria'), ('1T', 1, 'try', L, 'Grima, Aylen'),
    ('1T', 17, 'try', L, 'Romero, Teresa Abril'),
    ('2T', 4, 'try', L, 'Diaz, Sofía Abril'),
    ('2T', 5, 'substitution', L, 'Robles, Candelaria', 'Ramirez, Silvina'),
    ('2T', 7, 'try', L, 'Romero, Teresa Abril'),
    ('2T', 10, 'substitution', L, 'Iovane, Ursula', 'Diaz, Sofía Abril'),
    ('2T', 10, 'substitution', L, 'Leguizamon, Nahiara', 'Romero, Teresa Abril'),
    ('2T', 10, 'substitution', L, 'Romano, Candela', 'Campos Ruiz, Agostina'),
    ('2T', 10, 'substitution', L, 'Argañaraz, Nahir', 'Cardozo, Camila'),
    ('2T', 10, 'substitution', L, 'Casola, Norién Candela', 'Bortolozzo, Geovana Andrea'),
    ('2T', 10, 'substitution', L, 'Alvarez Costas, Camila', 'Cattaneo, Katherina'),
    ('2T', 10, 'try', L, 'Romero, Teresa Abril'),
    ('2T', 16, 'try', L, 'Medina, Azul'))
p33 = evs(
    ('2T', 0, 'substitution', L, 'Fernandez, Oriana Micaela', 'Acevedo, Veronica Pamela'),
    ('2T', 4, 'try', L, 'Maidana, Marianela Rita Soledad'),
    ('2T', 5, 'conversion', L, 'Ojeda, Melisa Silvana'),
    ('2T', 5, 'substitution', L, 'Gomez, Nilda', 'Villa, Guadalupe Del Carmen'),
    ('2T', 5, 'substitution', V, 'Velázquez Loncomán, Lucía Macarena', 'Sepúlveda, Ailin'),
    ('2T', 11, 'substitution', L, 'Fernandez, Florencia', 'Monzon, Alexandra'),
    ('2T', 11, 'substitution', L, 'Albornoz, Maira Carina', 'Verón, Sabrina Jaqueline'),
    ('2T', 15, 'substitution', V, 'Oyola, Yesica Cecilia', 'Farroni Reina, Florencia'),
    ('2T', 15, 'substitution', V, 'Kristensen, Maria Candela', 'Zuñiga, Bianca Lujan'),
    # la planilla dice 2T 57': imposible; se asienta al cierre del partido
    ('2T', 40, 'substitution', V, 'Guzman, Génesis', 'Toledo, Florencia'))

partidos = [
    {'id': 'f7a15a20-245b-4cc4-a502-ca2f7db7bb6a', 'rotulo': 'Cuyo vs Cordobesa · Zona B · planilla 327937', 'arbitro': 'Camila Abril Díaz',
     'local': lado('cuyo-femenino', CUYO_327937), 'visitante': lado('cordobesa-femenino', CORDOBESA), 'eventos': p37, '_esperado': (0, 34)},
    {'id': '91441bb6-50bd-4b62-bbe0-e3441b3c394f', 'rotulo': 'Tucumán vs Cuyo · Zona B · planilla 327938', 'arbitro': 'Daiana Del Milagro Cesaretti',
     'local': lado('tucuman-femenino', TUCUMAN), 'visitante': lado('cuyo-femenino', CUYO_327938), 'eventos': p38, '_esperado': (32, 0)},
    {'id': '559917df-0afc-4de1-8efb-000b9e196f9f', 'rotulo': 'Nordeste vs Alto Valle · Zona A · planilla 327933', 'arbitro': 'María Nazarena Seubert Also',
     'local': lado('nordeste-femenino', NORDESTE), 'visitante': lado('alto-valle-femenino', ALTO_VALLE), 'eventos': p33, '_esperado': (7, 0)},
]
for p in partidos:
    t = total(p['eventos'])
    print(p['rotulo'], 'eventos', t, 'esperado', p['_esperado'])
    assert (t['local'], t['visitante']) == p['_esperado']
    assert len(p['local']['titulares']) == 15 and len(p['local']['suplentes']) == 7
    assert len(p['visitante']['titulares']) == 15 and len(p['visitante']['suplentes']) == 7
    del p['_esperado']
json.dump({'descripcion': 'Encuentro Femenino de Selecciones de XV 2026 · planillas 327937, 327938, 327933', 'partidos': partidos},
          open(sys.argv[1], 'w', encoding='utf8'), ensure_ascii=False, indent=1)
