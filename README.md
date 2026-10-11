# Cờ Tướng 3D – Người vs Máy

Game cờ tướng (Xiangqi) 3D chạy trên trình duyệt, dựng bằng [Three.js](https://threejs.org/).
Bạn chơi với máy; AI chạy trong Web Worker nên giao diện không bị giật khi máy đang tính.

## Chạy game

Không cần build. Chỉ cần phục vụ thư mục qua HTTP (ES module và Web Worker không chạy với `file://`):

```bash
npm start            # = npx http-server -c-1 -p 8080 .
# hoặc
python3 -m http.server 8080
```

Mở <http://localhost:8080>. Three.js và font được tải từ CDN nên máy cần có mạng.

## Cách chơi

- Bấm vào quân của mình để chọn, các ô có thể đi sẽ sáng xanh (vòng đỏ = ăn quân), bấm vào ô đó để đi.
- Kéo chuột / vuốt để xoay bàn cờ, cuộn / chụm hai ngón để phóng to.
- **Độ khó**: Dễ, Trung bình, Khó (Khó tính tới ~3,5 giây mỗi nước, độ sâu 9–11).
- **Bạn cầm**: chọn quân Đỏ (đi trước) hoặc quân Đen (máy đi trước, camera quay sang phía Đen).
- **Đi lại** (Ctrl+Z) lùi nước của bạn và nước trả lời của máy. **Gợi ý** đánh dấu một nước nên đi.
- Biên bản ghi theo ký hiệu Việt Nam: `.` tiến, `/` thoái, `-` bình, ví dụ `P2-5`, `M8.7`, `X9.1`.

Ván kết thúc khi chiếu bí hoặc một bên hết nước đi (trong cờ tướng hết nước đi là thua).
Xử hòa khi thế cờ lặp lại 3 lần hoặc 60 nước liên tiếp không ăn quân.
Luật cấm chiếu dai / đuổi dai chưa được cài đặt.

## Cấu trúc

| File | Nội dung |
| --- | --- |
| `index.html`, `css/style.css` | Giao diện, import map cho Three.js |
| `js/main.js` | Dựng cảnh 3D (bàn, quân, ánh sáng, bóng), chọn/đi quân, hiệu ứng, âm thanh, điều khiển ván |
| `js/engine.js` | Luật cờ (sinh nước đi, chiếu tướng, lộ mặt tướng) và AI |
| `js/ai-worker.js` | Web Worker chạy AI, cấu hình các mức độ khó |
| `test/engine.test.js` | Kiểm thử engine (perft, luật đặc biệt, AI tìm chiếu bí) |

AI dùng iterative deepening + alpha-beta (PVS) với bảng chuyển vị Zobrist, null-move pruning,
late move reduction, killer/history heuristic và quiescence search; hàm đánh giá gồm giá trị quân
và bảng điểm vị trí.

## Kiểm thử

```bash
npm test
```
