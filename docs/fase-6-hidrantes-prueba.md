# Prueba manual de la Fase 6: Hidrantes

## Captura offline de tres hidrantes

1. En el panel local, crea una empresa con una sucursal y tres ubicaciones activas de tipo `hydrant`.
2. Con el teléfono y el servidor en la misma red, actualiza el catálogo de la app.
3. Detén el servidor o desconecta el teléfono de la red.
4. Crea una inspección para esa empresa y agrega el formato Hidrantes.
5. Abre Hidrantes y registra tres equipos. Selecciona dos ubicaciones del catálogo y usa “Otra ubicación” en el tercero.
6. Regresa a la inspección, vuelve a entrar y comprueba los tres registros.
7. Edita el segundo hidrante y elimina el tercero; confirma que quedan dos.
8. Cierra completamente la app, vuelve a abrirla y comprueba que los dos hidrantes permanecen.
9. Marca la inspección como pendiente, vuelve a abrirla y comprueba nuevamente los datos.
10. Completa los campos faltantes, finaliza la inspección, enciende el servidor y sincroniza.
11. En Reportes del panel debe existir una sola entrada con el formato “Hidrantes”. Descarga el libro y revisa la hoja `HIDRANTES`.
12. Sincroniza nuevamente. La inspección, los hidrantes y el reporte no deben duplicarse.

## Inspección mixta

1. Crea una sola inspección con Extintores e Hidrantes.
2. Registra dos extintores y dos hidrantes.
3. Finaliza y sincroniza.
4. El panel debe mostrar una sola entrada “Extintores, Hidrantes”.
5. El botón Descargar debe entregar un único libro con las hojas `EXTINTORES` e `HIDRANTES` rellenadas.

## Compatibilidad anterior

Abre una inspección antigua cuyo `form_data.pumps.hidrantes` sea un objeto único. Al entrar a Hidrantes debe aparecer como un registro, conservar sus textos y recibir un UUID sin duplicarse en aperturas posteriores.
