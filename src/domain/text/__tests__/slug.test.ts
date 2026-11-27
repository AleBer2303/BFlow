import { toSlugId } from '../slug';
import { toSlugId as fromIndex } from '../../index';

describe('toSlugId (CC-02)', () => {
  it.each([
    ['Salario', 'salario'],
    ['  Arriendo  ', 'arriendo'],
    ['Niño & Ñandú', 'nino_nandu'],
    ['Cuota de préstamo #3', 'cuota_de_prestamo_3'],
    ['---Ahorro---', 'ahorro'],
    ['Plan de datos y baño Ártico', 'plan_de_datos_y_bano_artico'],
    ['💰 Fondo 🚀', 'fondo'],
    ['', ''],
    ['!!!', ''],
  ])('"%s" -> "%s"', (input, expected) => {
    expect(toSlugId(input)).toBe(expected);
  });

  it('se exporta desde el dominio', () => {
    expect(fromIndex).toBe(toSlugId);
  });
});
