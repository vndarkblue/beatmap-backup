---
name: add-i18n-text
description: >-
  Use this skill when adding, modifying, or deleting user-facing strings or translation keys across English, Vietnamese, and Japanese locales.
---

# Runbook: Thêm / Sửa Chuỗi Đa Ngôn Ngữ (i18n Text)

Toàn bộ chuỗi hiển thị trên giao diện người dùng phải được bản địa hóa cho 3 ngôn ngữ: Tiếng Anh (`en`), Tiếng Việt (`vi`), và Tiếng Nhật (`ja`). Bộ test suite `tests/renderer/i18n.test.ts` sẽ tự động từ chối nếu có bất kỳ sự lệch pha nào về danh sách khóa hoặc tên biến nội suy.

---

## Bước 1: Xác Định Khóa Ngữ Nghĩa (Semantic Key)

Xác định vị trí phân nhóm trong cây JSON phù hợp với chức năng:

- `common`: Các nhãn dùng chung (OK, Cancel, Close, Save, Error, Loading...).
- `nav`: Các mục menu điều hướng bên thanh bên (Sidebar).
- `backup`: Toàn bộ chuỗi của màn hình Sao lưu beatmap.
- `download`: Toàn bộ chuỗi của màn hình Quản lý tải xuống và hàng đợi.
- `filter`: Tiêu chí lọc, nhãn xếp hạng, chế độ chơi.
- `settings`: Cài đặt đường dẫn, cấu hình mirror, chẩn đoán lỗi.

Ví dụ: Bạn muốn thêm nút "Dọn dẹp bộ nhớ đệm" trong card Cài đặt Database:
Khóa sẽ là: `settings.database.clear_cache_btn`.

---

## Bước 2: Cập Nhật Đồng Thời Cả 3 Tệp Ngôn Ngữ

Mở cả 3 tệp sau trong thư mục `src/renderer/src/i18n/locales/`:

1. **`en.json`**:
   ```json
   "settings": {
     "database": {
       "clear_cache_btn": "Clear Cache",
       "clear_cache_desc": "Remove temporary database cache files ({size} MB)."
     }
   }
   ```
2. **`vi.json`**:
   ```json
   "settings": {
     "database": {
       "clear_cache_btn": "Xóa bộ nhớ đệm",
       "clear_cache_desc": "Xóa các tệp đệm cơ sở dữ liệu tạm thời ({size} MB)."
     }
   }
   ```
3. **`ja.json`**:
   ```json
   "settings": {
     "database": {
       "clear_cache_btn": "キャッシュをクリア",
       "clear_cache_desc": "一時的なデータベースキャッシュファイルを削除します（{size} MB）。"
     }
   }
   ```

> [!CAUTION] > **Quy tắc bất di bất dịch về Placeholder**:
> Nếu trong chuỗi tiếng Anh có chứa biến `{size}`, thì cả chuỗi tiếng Việt và tiếng Nhật **bắt buộc phải chứa đúng biến `{size}`**. Không được đổi thành `{dung_luong}` hay `{kich_thuoc}`.

---

## Bước 3: Sử Dụng Trong Giao Diện Vue

### Trong phần `<template>`:

```html
<v-btn color="primary"> {{ $t('settings.database.clear_cache_btn') }} </v-btn>

<p>{{ $t('settings.database.clear_cache_desc', { size: cacheSizeMb }) }}</p>
```

### Trong phần `<script setup lang="ts">`:

```ts
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const handleSuccess = (): void => {
  const message = t('settings.database.clear_cache_btn')
  // ...
}
```

---

## Bước 4: Chạy Bài Test Xác Minh Tính Nhất Quán (Verification)

Chạy ngay bài kiểm thử i18n chuyên biệt:

```powershell
npx vitest run tests/renderer/i18n.test.ts
```

Bài test sẽ tự động xác minh 3 điều kiện:

1. `en`, `vi`, `ja` có tập hợp khóa hoàn toàn trùng khớp 100%.
2. Không có bất kỳ khóa nào bị bỏ trống chuỗi (`""`).
3. Mọi placeholder `{variable}` trong 3 file hoàn toàn khớp nhau.

Nếu test báo xanh (PASS), bạn đã hoàn thành việc thêm chuỗi i18n an toàn!
