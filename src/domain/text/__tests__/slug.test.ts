import { toSlugId } from '../slug';
import { toSlugId as fromIndex } from '../../index';

describe('toSlugId (CC-02)', () => {
  it.each([
    ['Salario Principal', 'salario_principal'],
    ['  Arriendo  ', 'arriendo'],
    ['Niño & Ñandú', 'nino_nandu'],
    ['Cuota FUNFAMI #3', 'cuota_funfami_3'],
    ['---Ahorro---', 'ahorro'],
    ['Plan de datos y baño Kábir', 'plan_de_datos_y_bano_kabir'],
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
