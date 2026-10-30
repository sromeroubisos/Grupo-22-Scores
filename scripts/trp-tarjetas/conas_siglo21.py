import json
def n(s):
    a,b=[x.strip() for x in s.split(',')]; return f'{b} {a}'
L='''1|Nieto, Tomas|2|Ferreyra, Maximiliano|3|Farias, Paulo|4|Luna, Marcos|5|Almada, Juan Gabriel|6|Sabre, Facundo|7|Barrera Grillo, Nicolas|8|Cravero, Alexis|9|Moretto, Miqueas|10|Aprile, Luciano|11|Gomez Lelli, Geronimo Facundo|12|Rey, Nicolas|13|Quinteros Carrizo, Alan Agustín|14|Coria, Marcelo Ariel|15|Bobatto, Guido|16|Aguirres, Pablo|17|Araoz, Alexis Ariel|18|Ontivero, Favio Ariel|19|Demarco, Victor Hugo|20|Palavecino, Antonio|21|Aguirre, Joaquin Matias|22|Timolati, Santiago|23|Simes, Federico Martin'''.split('|')
V='''1|Rivadero, Luca Rodrigo|2|De Chiara, Franco|3|Savarella, Bruno|4|Laion, Martin|5|Laporte, Octavio|6|Presidente, Matias|7|Depalo, Pedro José|8|Carpio Crembil, Maximiliano Tomas|9|Ceballos Faas, Lucas Ezequiel|10|Tachini, Facundo|11|Pero, Juan|12|Iscaro, Joaquin|13|Mazzarini, Agustin|14|Pedrocca, Gustavo|15|Murillo, Ezequiel|16|Taglioli Gomar, Nicolas|17|Cornu, Paul|18|Fait, Mateo|19|Álvarez, Homero|20|Castro Sleiman, Ignacio Amin|21|Diez Cuenca, Pedro|22|Villanova, Agustin|23|Vargas Martinovic, Mateo'''.split('|')
def eq(l,nombre):
    p=[{'numero':int(l[i]),'nombre':n(l[i+1])} for i in range(0,len(l),2)]
    return {'titulares':[x for x in p if x['numero']<=15],'suplentes':[x for x in p if x['numero']>15],'nombre':nombre}
E=[]
def e(m,p,t,j,eq_,d=None):
    x={'minuto':m,'periodo':p,'tipo':t,'jugador':n(j),'equipo':eq_}
    if d: x['detalle']='Entra: '+n(d)
    E.append(x)
for m,p,t,j in [(22,'1T','try','Gomez Lelli, Geronimo Facundo'),(22,'1T','conversion','Aprile, Luciano'),(24,'1T','penalty_goal','Aprile, Luciano'),(37,'1T','card_yellow','Demarco, Victor Hugo'),(40,'1T','card_yellow','Farias, Paulo'),(9,'2T','try','Bobatto, Guido'),(14,'2T','card_yellow','Almada, Juan Gabriel'),(40,'2T','try','Simes, Federico Martin'),(40,'2T','conversion','Aprile, Luciano')]: e(m,p,t,j,'local')
for m,j,d in [(5,'Luna, Marcos','Palavecino, Antonio'),(5,'Bobatto, Guido','Simes, Federico Martin'),(20,'Ferreyra, Maximiliano','Araoz, Alexis Ariel'),(22,'Farias, Paulo','Aguirres, Pablo')]: e(m,'2T','substitution',j,'local',d)
for m,p,t,j in [(32,'1T','try','Carpio Crembil, Maximiliano Tomas'),(32,'1T','conversion','Tachini, Facundo'),(11,'2T','try','Presidente, Matias'),(11,'2T','conversion','Tachini, Facundo'),(27,'2T','penalty_goal','Tachini, Facundo')]: e(m,p,t,j,'visitante')
out={'descripcion':'tarjeta 327313 Conas-Siglo21','partidos':[{'id':'989c6b89-bfc4-4f51-bb3f-6ec8599c1e1a','rotulo':'conas-r-c vs universidad-siglo-21-rugby 62bf0694 tarjeta 327313','arbitro':'Hernandez, Carlos Rafael','local':eq(L,'conas-r-c'),'visitante':eq(V,'universidad-siglo-21-rugby'),'eventos':E}]}
json.dump(out,open('src/scripts/formaciones/2026-10-27-conas-siglo21.json','w',encoding='utf-8'),ensure_ascii=False)
