import cv2
import numpy as np
from PIL import Image

def build_master_v3():
    W, H = 1536, 2752
    
    # 1. Load backup burgundy (750 x 1440) scaled to 1536 x 2752
    bac = Image.open('assets/card_01_hd_backup_burgundy.png').convert('RGB')
    bac_2k = bac.resize((W, H), Image.Resampling.LANCZOS)
    bac_np = np.array(bac_2k).astype(np.float32)
    
    # 2. Load 2.7K reference image (card01_bg.jpg)
    ref = Image.open('reference_wedding/assets/images/card01_bg.jpg').convert('RGB')
    ref_np = np.array(ref).astype(np.float32)
    
    # 3. Load 48MP raw photo
    user_raw = Image.open('迎宾照.jpg')
    cropped_user = user_raw.crop((197, 451, 5588, 7722))
    
    # Alignment: scale = 0.3045, offset = (-39, 277)
    s = 0.3045
    sw = int(cropped_user.width * s)
    sh = int(cropped_user.height * s)
    user_scaled = cropped_user.resize((sw, sw * cropped_user.height // cropped_user.width), Image.Resampling.LANCZOS)
    u_np = np.array(user_scaled).astype(np.float32)
    uh, uw, _ = u_np.shape
    
    # 4. Couple high-res patch
    dst_x1 = max(0, -39)
    dst_y1 = max(0, 277)
    dst_x2 = min(W, -39 + uw)
    dst_y2 = min(H, 277 + uh)
    
    src_x1 = dst_x1 - (-39)
    src_y1 = dst_y1 - 277
    src_x2 = src_x1 + (dst_x2 - dst_x1)
    src_y2 = src_y1 + (dst_y2 - dst_y1)
    
    couple_patch = np.copy(bac_np)
    couple_patch[dst_y1:dst_y2, dst_x1:dst_x2] = u_np[src_y1:src_y2, src_x1:src_x2]
    
    # Couple sharpness mask
    couple_mask = np.zeros((H, W), dtype=np.float32)
    cv2.ellipse(couple_mask, (880, 1450), (400, 720), 0, 0, 360, 1.0, -1)
    couple_mask = cv2.GaussianBlur(couple_mask, (121, 121), 40.0)
    couple_mask_3d = np.repeat(couple_mask[:, :, np.newaxis], 3, axis=2)
    
    base = couple_mask_3d * couple_patch + (1.0 - couple_mask_3d) * bac_np
    
    # 5. Inject 2.7K textures from ref_np:
    swag_edge = np.load('swag_edge_smooth.npy')
    
    frame_mask = np.zeros((H, W), dtype=np.float32)
    
    # Top arch swag:
    for x in range(W):
        top_limit = int(max(swag_edge[x] - 10, 0))
        frame_mask[:top_limit, x] = 1.0
        
    # Top-right curtain & flower juncture (smooth seamless transition)
    frame_mask[:500, 1160:] = 1.0
    
    # Left velvet curtain:
    frame_mask[:, :250] = 1.0
    
    # Golden tassels:
    cv2.rectangle(frame_mask, (0, 1200), (260, 1950), 1.0, -1)
    
    # Right flowers:
    frame_mask[300:2300, 1330:] = 1.0
    frame_mask[2300:, 1290:] = 1.0
    
    # Smooth frame mask
    frame_mask = cv2.GaussianBlur(frame_mask, (31, 31), 11.0)
    frame_mask_3d = np.repeat(frame_mask[:, :, np.newaxis], 3, axis=2)
    
    # Composite
    master = frame_mask_3d * ref_np + (1.0 - frame_mask_3d) * base
    master = np.clip(master, 0, 255).astype(np.uint8)
    
    # Save master
    Image.fromarray(master).save('assets/card01_real_couple_2k.jpg', quality=98)
    print("Saved assets/card01_real_couple_2k.jpg!")

if __name__ == '__main__':
    build_master_v3()
