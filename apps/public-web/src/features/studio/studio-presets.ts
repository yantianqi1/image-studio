export type StudioPreset = Readonly<{
  id: string;
  title: string;
  prompt: string;
  hint: string;
  count: number;
  aspectRatio: string;
  resolution: string;
  quality: string;
}>;

export const STUDIO_PRESETS: readonly StudioPreset[] = [
  {
    id: "stellar-poster",
    title: "轮廓宇宙海报",
    prompt: "一张9:16竖版电影海报，主体是一个人物的轮廓剪影，轮廓内部填充着浩瀚的宇宙星空、星云和行星，背景是深邃的暗蓝色太空。人物轮廓边缘有微弱的光晕效果，整体风格科幻而梦幻，色调以深蓝、紫色和金色为主。",
    hint: "适合社交媒体竖版海报",
    count: 1,
    aspectRatio: "9:16",
    resolution: "1080x1920",
    quality: "high",
  },
  {
    id: "museum-infographic",
    title: "青花瓷博物馆图鉴",
    prompt: "一张4:3横版博物馆风格的信息图鉴，展示一件精美的青花瓷花瓶。画面分为主体展示区和标注区，主体是高清的青花瓷花瓶正面照，周围有细节放大图和工艺说明标注。背景是米白色宣纸质感，整体风格典雅学术，字体使用宋体。",
    hint: "适合教育类内容和博物馆展示",
    count: 1,
    aspectRatio: "4:3",
    resolution: "1440x1080",
    quality: "high",
  },
  {
    id: "fashion-promo",
    title: "古风联动宣传图",
    prompt: "一张9:16竖版时尚杂志风格的宣传图，一位身着改良汉服的现代女性模特，站在古典园林与现代建筑交融的场景中。服装融合传统刺绣与现代剪裁，光影效果如同专业摄影棚拍摄，色调温暖而高级。",
    hint: "适合品牌联动和时尚宣传",
    count: 1,
    aspectRatio: "9:16",
    resolution: "1080x1920",
    quality: "high",
  },
  {
    id: "game-screenshot",
    title: "地平线深圳实机图",
    prompt: "一张16:9横版游戏截图风格的画面，展示深圳城市天际线在黄昏时分的景象，如同开放世界赛车游戏的实机画面。前景是一辆跑车行驶在滨海大道上，远处是腾讯大厦和平安金融中心等标志性建筑的剪影，天空呈现橙红色渐变，整体画面有轻微的动态模糊和镜头光晕效果。",
    hint: "适合游戏宣传和城市风光",
    count: 1,
    aspectRatio: "16:9",
    resolution: "1920x1080",
    quality: "high",
  },
];
