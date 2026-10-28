# Word Orchard

Akiko 的互动英语采摘游戏。读出英文单词，把它们收进篮子，让一棵小树随着学习进度慢慢长大。

## 进阶课程

课程包含 6 个 Part、18 关、72 个单词，每关学习 4 个词。每个 Part 依次经历“初识新词”“快乐进阶”“小小挑战”，主题顺序为：

1. 水果 Fruit
2. 蔬菜 Vegetables
3. 衣服 Clothes
4. 交通工具 Transport
5. 动物 Animals
6. 自然 Nature

词汇由常见的短单词逐步过渡到较长、较复杂的单词，并用 Pre A1、A1、A2 标记大致难度。课程参照 Cambridge Young Learners 的话题范围与 CEFR 阶梯编排，不是剑桥官方课程或官方词表的完整复刻。

参考资料：

- [Cambridge English: Pre A1 Starters](https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/starters)
- [Cambridge English: A1 Movers](https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/movers)
- [Cambridge English: A2 Flyers](https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/flyers)

完成每关会解锁下一关，并播放小树成长和庆祝动画。成长地图可以复习已解锁关卡；复习只重置本轮树上的单词，不会清空篮子里已经收集的词。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址。生产构建使用 `npm run build`。

## 语音说明

语音识别使用浏览器的 Web Speech API，推荐最新版 Chrome 或 Edge，并通过 `localhost` 或 HTTPS 访问。首次使用时需要允许麦克风权限。

部分浏览器或网络无法连接在线语音识别服务。此时可以在朗读面板中点击“我已大声朗读”，继续完成采摘。单词示范发音使用浏览器本地语音合成，与语音识别互不影响。

当前关卡、解锁进度和收集记录保存在当前浏览器的 localStorage 中，刷新页面后仍可继续。可在篮子中清空全部进度，重新开始成长之旅。
