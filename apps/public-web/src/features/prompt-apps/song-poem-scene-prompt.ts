export type SongPoemScenePromptInput = Readonly<{
  note: string;
  poem: string;
}>;

const SONG_POEM_SCENE_TEMPLATE = `---

请根据【对应小诗】生成一张中国宋代诗意场景图。

这是一幅横版 16:9 的双世界对照画面。一堵高大的青砖墙作为画面中央分割线，墙体成为两个世界的界线，将整幅画分成墙外与墙内两个情绪截然不同的空间。

墙外是一条春日小路。一位青衫书生背对画面站立，仰头侧耳倾听墙内的笑声，看不到他的面容；衣袂随风微动，落花与柳絮飘散，气氛安静而略带惆怅。

墙内是一座春日庭院。一位红衣少女背对画面荡秋千，裙摆飞扬，看不到正脸，身旁侍女陪伴，似在嬉笑；庭院花开繁盛，阳光明亮温暖。

墙体必须始终保持清晰的分割作用，但不要像简单的贴图边界。外侧的春日小路、内侧的庭院花木与人物动作，都要围绕这堵墙形成强烈的情绪对比和叙事张力。

【对应小诗】应作为这幅画的情绪来源与文字气口，可以自然出现在画面角落、题签、题跋或诗笺上，但不要喧宾夺主；如果画面出现文字，必须清晰、雅致、少量，并与中国古典美学融合。

整体风格为中国古典美学，水墨与工笔结合，电影级光影，唯美意境，高细节，春日明亮而克制，安静中带有淡淡惆怅。`;

export function buildSongPoemScenePrompt(input: SongPoemScenePromptInput) {
  const poem = input.poem.trim();
  const note = input.note.trim();
  const poemLine = note ? `【对应小诗】= {${poem}}（${note}）` : `【对应小诗】= {${poem}}`;
  return `${poemLine}\n\n${SONG_POEM_SCENE_TEMPLATE}`;
}
