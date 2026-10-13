// 4 thời đại — tên Việt + flavor text lấy từ kich-ban-4-thoi-dai.md
// (chuẩn cuối cùng cho cơ chế lên đời).

/** Id 4 thời đại, theo đúng thứ tự tiến triển. */
export type AgeId = 'stone' | 'tool' | 'bronze' | 'iron';

export interface AgeDef {
  id: AgeId;
  vnName: string;
  original: string;
  /** Câu flavor hiện banner + tiếng trống đồng khi lên đời xong. */
  flavor: string;
}

export const AGES: AgeDef[] = [
  {
    id: 'stone',
    vnName: 'Thời Hùng Vương sơ khai',
    original: 'Stone Age',
    flavor: 'Dựng làng lập ấp giữa rừng thiêng. Khai hoang, săn bắt, đốn tre.',
  },
  {
    id: 'tool',
    vnName: 'Thời dựng nước',
    original: 'Tool Age',
    flavor: 'Làng thành xã, ruộng lúa xanh rì. Rèn công cụ, lập đội dân binh.',
  },
  {
    id: 'bronze',
    vnName: 'Thời Đồ Đồng',
    original: 'Bronze Age',
    flavor:
      'Trống đồng Đông Sơn vang rền! Đúc đồng, dựng thành, luyện quân chính quy.',
  },
  {
    id: 'iron',
    vnName: 'Thời Âu Lạc',
    original: 'Iron Age',
    flavor:
      'Nỏ thần Liên Châu đã thành! Thành Cổ Loa sừng sững — quyết chiến!',
  },
];

/** Chỉ số thứ tự thời đại trong AGES (-1 nếu id lạ). */
export function ageIndex(id: string): number {
  return AGES.findIndex((a) => a.id === id);
}
