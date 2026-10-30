"""Los 36 partidos del Top 8 Cuyano 2026 que NO tienen ficha propia en rugbydecuyo.com.ar.

La fuente publica de cada uno solo la cronica (fecha-NN.html): quien hizo cada try, quien pateo
cada conversion y cada penal. No hay minutos ni formaciones. Cada entrada se transcribe de la
cronica y despues `generar.py` exige que los eventos sumen el marcador de la base: si no cierra,
no se carga.

Clave: (local, visitante). Cada lado:
  T  tries              [(jugador, cantidad)]
  TP try penal          cantidad
  C  conversiones       [(jugador|None, cantidad)]   None = la cronica no dice quien pateo
  P  penales            [(jugador, cantidad)]
  D  drops              [(jugador, cantidad)]
  Y  amarillas / R rojas del equipo (solo cuando la fuente las da por equipo)
"""

TEQ, TOR, SJ, CPBM, MEN, LIC, UNI, MAR = 'TEQ', 'TOR', 'SJ', 'CPBM', 'MEN', 'LIC', 'UNI', 'MAR'

PROSA = {
    # ---- Fecha 1 ----
    (TEQ, TOR): {
        'fecha': 1,
        TEQ: dict(T=[('Benjamín Pérez', 1)], TP=1, P=[('Augusto Kretschmar', 4)], C=[('Augusto Kretschmar', 1)]),
        TOR: dict(T=[('Francisco Cassone', 2), ('Federico Serpa', 2)], C=[('Federico Serpa', 3)], P=[('Federico Serpa', 2)]),
    },
    (SJ, CPBM): {
        'fecha': 1,
        SJ: dict(T=[('Mariano Reinoso', 1), ('Joaquín Bridge', 1)], C=[('Bautista Cúneo', 2)]),
        CPBM: dict(T=[('Alejo Magliano', 1), ('Santiago Videla', 1)], C=[('Alejo Magliano', 1), (None, 1)], P=[('Alejo Magliano', 6)]),
    },
    (UNI, MAR): {
        'fecha': 1,
        UNI: dict(T=[('Nicolás Martínez', 2), ('Vito Sambrizzi', 1)], C=[('Teo Azar', 2)], P=[('Teo Azar', 2)]),
        MAR: dict(T=[('Gabriel Pronce', 1), ('Rafael Cardozo', 1), ('Octavio Soria', 1), ('Juan Pablo Soria', 1)],
                  C=[('Bautista Filizzola', 2)], P=[('Bautista Filizzola', 1)]),
    },
    # ---- Fecha 2 ----
    (CPBM, MEN): {
        'fecha': 2,
        CPBM: dict(P=[('Alejo Magliano', 1)]),
        MEN: dict(T=[('Julián Cossutta', 3), ('Ignacio Vidal', 2)], TP=1, C=[('Tomás Canedo', 2)], P=[('Tomás Canedo', 1)]),
    },
    (SJ, TEQ): {
        'fecha': 2,
        SJ: dict(T=[('Felipe González', 2), ('Santiago Peñafort', 1), ('Joaquín Farré', 1)],
                 C=[('Bautista Cúneo', 2)], P=[('Bautista Cúneo', 1), ('Estiliano Battezzati', 1)]),
        TEQ: dict(T=[('Benjamín Pérez', 1)], C=[('Augusto Kretschmar', 1)], P=[('Augusto Kretschmar', 2)]),
    },
    (LIC, UNI): {
        'fecha': 2,
        LIC: dict(T=[('Facundo Lucero', 2), ('Ignacio Caldo', 1), ('Santiago Videau', 1)], C=[('Tomás Videla', 3)], P=[('Tomás Videla', 3)]),
        UNI: dict(T=[('Nicolás Martínez', 1), ('Santiago Achem', 1), ('Bautista Suarez', 1)], C=[('Gerónimo Arabel', 3)], P=[('Teo Azar', 1)]),
    },
    # ---- Fecha 3 ----
    (CPBM, TOR): {
        'fecha': 3,
        CPBM: dict(T=[('Branco Gutierrez', 1), ('Joaquín Rodriguez', 1)], C=[('Alejo Magliano', 1)],
                   P=[('Alejo Magliano', 2), ('Facundo Consorte', 1)]),
        TOR: dict(T=[('Juan Ignacio Dangelo', 1), ('Facundo Tonón', 1), ('Francisco Cassone', 1), ('Bautista Bruno', 1)],
                  C=[('Francisco Galdeano', 1)], P=[('Francisco Galdeano', 3), ('Pedro Lértora', 1)]),
    },
    (MEN, UNI): {
        'fecha': 3,
        MEN: dict(T=[('Santiago Tapia', 1), ('Agustín Lombardo', 1), ('Santiago Dapas', 1), ('Francisco Álvarez', 1)], TP=1,
                  C=[('Tomás Canedo', 3)]),
        UNI: dict(T=[('Gerónimo Adarvez', 1), ('Agustín Sales', 1), ('Julián Aguiar', 1), ('Nicolás Martínez', 1)],
                  C=[('Gerónimo Arabel', 3)], P=[('Gerónimo Arabel', 1)]),
    },
    (MAR, SJ): {
        'fecha': 3,
        MAR: dict(T=[('Marcos Porro', 1), ('Benjamín Filizzola', 1), ('Matías Colomer', 1), ('Bautista Curto', 1)],
                  C=[('Lisandro Sosa', 2), ('Bautista Filizzola', 1)]),
        SJ: dict(T=[('Bautista Scadding', 1)], C=[('Estiliano Battezzati', 1)], P=[('Estiliano Battezzati', 5)]),
    },
    # ---- Fecha 4 ----
    (UNI, TEQ): {
        'fecha': 4,
        UNI: dict(T=[('Gerónimo Arabel', 2), ('Julián Aguiar', 1), ('Lautaro Torcivia', 1), ('Juan Ignacio del Carril', 1), ('Agustín Sales', 1)],
                  C=[('Gerónimo Arabel', 4)], P=[('Gerónimo Arabel', 2)], D=[('Gerónimo Arabel', 1)]),
        TEQ: dict(T=[('Mauricio Godoy', 1)]),
    },
    (SJ, MEN): {
        'fecha': 4,
        SJ: dict(T=[('Bautista Domanico', 1), ('Juan Pablo Venier', 1), ('Estiliano Battezzati', 1)],
                 C=[('Estiliano Battezzati', 1)], P=[('Estiliano Battezzati', 2)]),
        MEN: dict(T=[('Renato Barolo', 1), ('Julián Cossutta', 1), ('Ernesto Giudice', 1), ('Santiago Tapia', 1)],
                  C=[('Franco Palazzini', 2), ('Santiago Rez Masud', 2)], P=[('Santiago Rez Masud', 2)]),
    },
    (MAR, CPBM): {
        'fecha': 4,
        MAR: dict(T=[('Alejandro Pronce', 2), ('Conall Unger', 2), ('Luciano Fariello', 1), ('Telmo Fernández', 1), ('Julián Guevara', 1),
                     ('Matías Colomer', 1), ('Lisandro Sosa', 1), ('Tomás Montilla', 1)], C=[('Lisandro Sosa', 6)]),
        CPBM: dict(T=[('Facundo Consorte', 1), ('Luciano Gutierrez', 1), ('Manuel Sonzogni', 1)],
                   P=[('Alejo Magliano', 2)], C=[('Alejo Magliano', 3)]),
    },
    # ---- Fecha 5 ----
    (TOR, UNI): {
        'fecha': 5,
        TOR: dict(T=[('Facundo Tonón', 3), ('Juan Ignacio Dangelo', 3), ('Martín Orrico', 1), ('Juan Enrique Arnut', 1), ('Gonzalo Intzes', 1)],
                  C=[('Francisco Galdeano', 5)]),
        UNI: dict(T=[('Gerónimo Arabel', 1), ('Nicolás Martínez', 1), ('Gerónimo Adarvez', 1), ('Joaquín Sánchez', 1), ('Francisco Marcucci', 1),
                     ('Santiago Baldi', 1), ('Lucas Bulóz', 1)], TP=1, C=[('Gerónimo Arabel', 5)]),
    },
    (LIC, SJ): {
        'fecha': 5,
        LIC: dict(T=[('Agustín Correa Llano', 2), ('Facundo Lucero', 1), ('Julián Rossi', 1), ('Enzo Cirrincione', 1), ('Gino Castellino', 1)], TP=1,
                  C=[('Ignacio Gaído', 4)], P=[('Ignacio Gaído', 1)]),
        SJ: dict(T=[('Joaquín Farré', 1), ('Felipe González', 1), ('Gonzalo Roldán', 1), ('Santiago Albarracín', 1)], C=[('Estiliano Battezzati', 3)]),
    },
    (TEQ, CPBM): {
        'fecha': 5,
        TEQ: dict(T=[('Nicolás Quiroga', 2), ('Lautaro Calle', 1)], C=[('Lautaro Calle', 2)], P=[('Lautaro Calle', 1)]),
        CPBM: dict(T=[('Fausto Martínez', 2), ('Luciano Gutierrez', 1), ('Francisco García Salazar', 1)],
                   C=[('Alejo Magliano', 2)], P=[('Alejo Magliano', 3)]),
    },
    # ---- Fecha 6 ----
    (CPBM, UNI): {
        'fecha': 6,  # la cronica dice 26-15; el marcador oficial (tabla y base) es 25-16 y es el que cierra con los eventos
        CPBM: dict(T=[('Fausto Martínez', 2), ('Manuel Sonzogni', 1)], C=[('Facundo Consorte', 1), ('Alejo Magliano', 1)], P=[('Alejo Magliano', 2)]),
        UNI: dict(T=[('Guillermo Quiroga', 1), ('Juan Martín Uzair', 1)], P=[('Gerónimo Arabel', 2)]),
    },
    (TEQ, MEN): {
        'fecha': 6,
        TEQ: dict(T=[('Román Zelada', 1)]),
        MEN: dict(T=[('Julián Cossutta', 2), ('Santiago Rez Masud', 2), ('Francisco Álvarez', 1), ('Emanuel Guzmán', 1),
                     ('Santiago Tapia', 1), ('Mariano Cicconi', 1)], C=[('Santiago Rez Masud', 7)]),
    },
    (SJ, TOR): {
        'fecha': 6,
        SJ: dict(T=[('Juan Cruz Yuba', 1), ('Estiliano Battezzati', 1), ('Tobías Cabeza', 1)], TP=1,
                 C=[('Estiliano Battezzati', 2)], P=[('Estiliano Battezzati', 2)]),
        TOR: dict(T=[('Matías Farah', 3), ('Facundo Tonón', 1), ('Juan Ignacio Dangelo', 1), ('Martín Orrico', 1), ('Lautaro Varela', 1),
                     ('Gonzalo Intzes', 1), ('Tomás Arrigoni', 1), ('Julián Tomas', 1)],
                  C=[('Francisco Galdeano', 6), ('Tomás Arrigoni', 2)]),
    },
    # ---- Fecha 7 ----
    (MAR, TEQ): {
        'fecha': 7,
        MAR: dict(T=[('Gerónimo Tejada', 1), ('Lucas Bartolini', 1), ('Ignacio Laborde', 1), ('Tomás Montilla', 1), ('Telmo Fernández', 1)],
                  C=[('Genaro Podestá', 2), ('Benjamín Barcenilla', 2)]),
        TEQ: dict(T=[('Esteban Fernández', 1), ('Lucas Salguero', 1), ('Luciano Castellanos', 1)], C=[('Lautaro Calle', 2)]),
    },
    (LIC, CPBM): {
        'fecha': 7,
        LIC: dict(T=[('Juan Manuel Pérez Caram', 1), ('Ignacio Gaído', 1), ('Tomás Castro', 1), ('Álvaro Oyonarte', 1), ('Santiago Videau', 1)],
                  P=[('Tomás Videla', 1)], C=[('Tomás Videla', 3)]),
        CPBM: dict(T=[('Santiago Videla', 1), ('Juan Pablo Montilla', 1), ('Manuel Sonzogni', 1)], C=[('Alejo Magliano', 3)]),
    },
    (UNI, SJ): {
        'fecha': 7,
        UNI: dict(T=[('Joaquín Sánchez', 2)], C=[('Gerónimo Arabel', 1)], P=[('Gerónimo Arabel', 1)]),
        SJ: dict(T=[('Juan Manuel Ruiz', 1), ('Bautista Scadding', 1), ('Bautista Domanico', 1)], C=[('Estiliano Battezzati', 2)], P=[('Estiliano Battezzati', 1)]),
    },
    # ---- Fecha 8 ----
    (MAR, UNI): {
        'fecha': 8,  # la cronica dice 37-28; tabla y base dicen 38-27 y los eventos cierran con 38-27
        MAR: dict(T=[('Francisco Allamand', 2), ('Lucas Bartolini', 1), ('Alejandro Pronce', 1), ('Matías Colomer', 1), ('Telmo Fernández', 1)],
                  C=[('Tobías Filizzola', 4)]),
        UNI: dict(T=[('Alan Pedrol', 1), ('Joaquín Sánchez', 1), ('Tomás Giménez', 1)], C=[('Teo Azar', 3)], P=[('Teo Azar', 2)]),
    },
    (TOR, TEQ): {
        'fecha': 8,
        TOR: dict(T=[('Facundo Tonón', 6), ('Conrado Bertranou', 3), ('Tomás Arrigoni', 2), ('Bautista Bruno', 2), ('Federico Serpa', 1), ('Juan Enrique Arnut', 1)],
                  TP=1, C=[('Federico Serpa', 14)]),
        TEQ: dict(T=[('Pablo Echalecu', 1)], C=[('Lautaro Calle', 1)]),
    },
    (CPBM, SJ): {
        'fecha': 8,
        CPBM: dict(T=[('Juan Martín Bazán', 2), ('Branco Gutierrez', 1)], P=[('Fabricio Stirpa', 1)]),
        SJ: dict(T=[('Gonzalo Roldán', 1), ('Santiago Albarracín', 1)], C=[('Estiliano Battezzati', 2)], P=[('Estiliano Battezzati', 5)]),
    },
    # ---- Fecha 9 ----
    (UNI, LIC): {
        'fecha': 9,
        UNI: dict(T=[('Joaquín Sánchez', 4), ('Valentino Solda', 1)], P=[('Teo Azar', 1)],
                  C=[('Teo Azar', 1), ('Gerónimo Arabel', 2), ('Santiago Baldi', 1)]),
        LIC: dict(T=[('Ignacio Gaído', 3), ('Ramiro Gassull', 1), ('Felipe Altamiranda', 1), ('Francisco Ricci', 1), ('Bruno Cirrincione', 1)],
                  C=[('Juan Mateo Sancho', 5)]),
    },
    (MEN, CPBM): {
        'fecha': 9,
        MEN: dict(T=[('Ignacio Lucero', 2), ('Julián Cossutta', 1), ('Francisco Stávile', 1)], C=[('Tomás Canedo', 3)]),
        CPBM: dict(T=[('Fabricio Stirpa', 2), ('Branco Gutierrez', 1), ('Alejo Magliano', 1)],
                   C=[('Alejo Magliano', 3), ('Fabricio Stirpa', 1)], P=[('Alejo Magliano', 1), ('Fabricio Stirpa', 1)]),
    },
    (TEQ, SJ): {
        'fecha': 9,
        TEQ: dict(T=[('Lautaro Calle', 1), ('Román Zelada', 1), ('Gastón Giachini', 1)], C=[('Augusto Kretschmar', 3)]),
        SJ: dict(T=[('Bautista Scadding', 3), ('Alejo Olguín', 1), ('Estiliano Battezzati', 1)], P=[('Estiliano Battezzati', 1)]),
    },
    # ---- Fecha 10 ----
    (UNI, MEN): {
        'fecha': 10,
        UNI: dict(T=[('Tomás Giménez', 2), ('Mariano Lloveras', 1), ('Javier Fernández', 1), ('Francisco Marcucci', 1)],
                  C=[('Gerónimo Arabel', 2)], P=[('Gerónimo Arabel', 1), ('Mariano Lloveras', 1)]),
        MEN: dict(T=[('Santiago Tapia', 1), ('Ignacio Vidal', 1), ('Julián Cossutta', 1), ('Francisco Stávile', 1)],
                  C=[('Tomás Canedo', 3)], P=[('Tomás Canedo', 2)]),
    },
    (SJ, MAR): {
        'fecha': 10,
        SJ: dict(T=[('Bautista Scadding', 1), ('Francisco Nievas', 1), ('Bautista Cúneo', 1), ('Rodrigo Licciardi', 1)],
                 C=[('Estiliano Battezzati', 2)], P=[('Estiliano Battezzati', 1)]),
        MAR: dict(T=[('Lautaro Sturniolo', 1), ('Alejandro Pronce', 1), ('Telmo Fernández', 1), ('Tobías Filizzola', 1), ('Tomás Montilla', 1)],
                  C=[('Tobías Filizzola', 2)]),
    },
    (TOR, CPBM): {
        'fecha': 10,
        TOR: dict(T=[('Marcos Cassone', 1), ('Facundo Tonón', 1), ('Gonzalo Bertranou', 1)], C=[('Francisco Galdeano', 2), ('Federico Serpa', 1)]),
        CPBM: dict(T=[('Valentín Stirpa', 1), ('Alejo Magliano', 1)], D=[('Fabricio Stirpa', 1)],
                   P=[('Alejo Magliano', 1), ('Facundo Consorte', 1)], C=[('Alejo Magliano', 1)]),
    },
    # ---- Fecha 11 ----
    (CPBM, MAR): {
        'fecha': 11,
        CPBM: dict(T=[('Marcos Montilla', 1)], P=[('Alejo Magliano', 1)], C=[('Alejo Magliano', 1)]),
        MAR: dict(T=[('Alejo Videla', 1), ('Lucas Bartolini', 1), ('Francisco Allamand', 1), ('Tomás Gómez', 1)],
                  C=[('Tobías Filizzola', 2)], P=[('Tobías Filizzola', 1)]),
    },
    (MEN, SJ): {
        'fecha': 11,
        MEN: dict(T=[('Julián Cossutta', 3), ('Tomás Canedo', 1), ('Francisco Stávile', 1), ('Juan Pablo Álvarez', 1)],
                  C=[('Tomás Canedo', 4)], P=[('Tomás Canedo', 1)]),
        SJ: dict(T=[('Bautista Scadding', 1), ('Juan Manuel Ruiz', 1), ('Gonzalo Roldán', 1), ('Tobías Cabeza', 1)],
                 C=[('Estiliano Battezzati', 4)], P=[('Estiliano Battezzati', 4)]),
    },
    (TEQ, UNI): {
        'fecha': 11,
        TEQ: dict(T=[('Román Zelada', 2), ('Gonzalo Pérez', 1), ('Francisco Vega', 1)], C=[('Augusto Kretschmar', 4)]),
        UNI: dict(T=[('Vito Sambrizzi', 2), ('Juan Ignacio del Carril', 1), ('Gerónimo Arabel', 1), ('Joaquín Sánchez', 1),
                     ('Mariano Lloveras', 1), ('Gerónimo Adarvez', 1)], C=[('Gerónimo Arabel', 4), ('Gerónimo Adarvez', 2)]),
    },
    # ---- Fecha 12 (con tarjetas por equipo de la tabla "Fecha N°12") ----
    (CPBM, TEQ): {
        'fecha': 12,
        CPBM: dict(T=[('Fabricio Stirpa', 1), ('Valentín Caprioli', 1), ('Facundo Consorte', 1), ('Pedro Martínez', 1)], TP=1,
                   C=[('Alejo Magliano', 1), ('Francisco García Salazar', 1)], Y=2),
        TEQ: dict(T=[('Lautaro Calle', 1), ('Luciano Castellanos', 1), ('Juan Manuel Maure', 1)],
                  C=[('Augusto Kretschmar', 1)], P=[('Augusto Kretschmar', 3)], Y=2, R=1),
    },
    (UNI, TOR): {
        'fecha': 12,
        UNI: dict(T=[('Nicolás Martínez', 2), ('Vito Sambrizzi', 1), ('Francisco Marcucci', 1), ('Juan Cruz Magariños', 1)],
                  C=[('Gerónimo Arabel', 3)]),
        TOR: dict(T=[('Gino Ambrosi', 2), ('Tomás Díaz', 1), ('Facundo Tonón', 1), ('Enzo Filice', 1), ('Tomás Arrigoni', 1)],
                  C=[('Federico Serpa', 5)], Y=3, R=1),
    },
    (SJ, LIC): {
        'fecha': 12,
        SJ: dict(T=[('Felipe González', 2), ('Tobías Cabeza', 1), ('Bautista Scadding', 1), ('Estiliano Battezzati', 1)],
                 C=[('Estiliano Battezzati', 5)], Y=1),
        LIC: dict(T=[('Julián Rossi', 1), ('Agustín Correa Llano', 1), ('Tomás Bazán', 1), ('Bruno Cirrincione', 1)], TP=1,
                  C=[('Tomás Videla', 2)], P=[('Tomás Videla', 1)]),
    },
}
