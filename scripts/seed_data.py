"""
生成模拟 baseline 种子数据用于开发和演示。
实际比赛前应替换为真实采集的小红书笔记数据。

Usage:
    python scripts/seed_data.py
"""
import sqlite3
import json
import random
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "baseline.db")

FOOD_TITLES = [
    "手把手教你做日式溏心蛋！零失败！", "一周减脂餐分享｜好吃不胖",
    "这家店的牛肉面绝了！排队2小时值得", "5分钟早餐｜上班族必备快手料理",
    "在家复刻米其林甜品，成本不到20元", "今日份便当🍱简单又好看",
    "火锅底料测评！10款热门品牌大比拼", "减脂期也能吃的神仙甜品合集",
    "探店｜藏在巷子里的宝藏咖啡馆", "空气炸锅食谱合集｜懒人必备",
    "一人食晚餐｜治愈独居的小确幸", "网红餐厅避雷指南‼️别再踩坑了",
    "秋天第一杯奶茶自制教程🧋", "宿舍神器！不用火不用电也能做大餐",
    "妈妈的味道｜家常红烧肉做法", "低卡高蛋白沙拉｜越吃越瘦",
]

FASHION_TITLES = [
    "小个子穿搭｜155cm也能穿出大长腿", "一衣多穿｜一件白衬衫的7种搭配",
    "秋冬必入的5件基础款｜百搭不出错", "微胖女孩的显瘦穿搭公式",
    "通勤穿搭分享｜上班也要美美的", "今日OOTD｜日系文艺风",
    "学生党平价穿搭｜全身不过百", "这条裤子也太显腿长了吧！",
    "韩系穿搭合集｜温柔到骨子里", "显白穿搭｜黄皮女孩看过来",
    "春季穿搭灵感｜拒绝臃肿出门", "大衣+毛衣的神仙组合",
    "氛围感穿搭教程｜秒变韩剧女主", "梨形身材穿搭指南｜遮肉显瘦",
    "极简穿搭｜衣柜里只需要这10件", "约会穿搭｜又甜又辣的一天",
]

TECH_TITLES = [
    "2024最值得买的平板电脑推荐", "iPhone vs 安卓？真实使用一年对比",
    "程序员必备的10个效率工具", "AI绘画入门教程｜零基础也能出大片",
    "MacBook选购指南｜别花冤枉钱", "智能家居改造全记录｜花了3万值吗",
    "这个APP改变了我的学习方式", "数码产品年度盘点｜好用到哭",
    "iPad学习法｜从学渣到学霸", "耳机横评｜千元内最值得买的5款",
    "NAS入门指南｜打造私人云存储", "手机摄影技巧｜拍出电影质感",
    "机械键盘入坑指南｜新手必看", "二手数码避坑指南‼️", 
    "AI工具合集｜效率提升10倍", "极简桌面布置｜打造高效工作台",
]

TRAVEL_TITLES = [
    "三亚5天4晚超全攻略｜人均3000", "小众旅行地推荐｜国内最美10个县城",
    "第一次去日本｜东京大阪自由行攻略", "周末去哪玩？上海周边一日游合集",
    "西藏自驾游记｜此生必去一次", "云南旅拍｜出片率超高的机位分享",
    "露营装备清单｜新手入门指南", "迪士尼省钱攻略｜不排队玩转全园",
    "重庆3天2晚｜吃喝玩乐全攻略", "泰国曼谷芭提雅7日游详细行程",
    "打卡全国最美图书馆TOP10", "自驾318国道｜一路风景一路歌",
    "北海道冬季旅行｜雪景太绝了", "成都旅游必打卡的20个地方",
    "欧洲穷游攻略｜月薪5k也能去", "海岛度假｜国内最值得去的5个海岛",
]

BEAUTY_TITLES = [
    "黄皮显白口红合集｜涂上秒变白一度", "新手化妆教程｜5分钟出门妆",
    "2024年度爱用护肤品盘点", "毛孔粗大怎么办？亲测有效的方法",
    "平价护肤好物｜学生党必入", "夏天不脱妆的秘诀都在这了！",
    "敏感肌护肤指南｜别再乱用了", "眼影配色公式｜新手也能画出高级感",
    "防晒测评｜油皮干皮分别怎么选", "美白精华横评｜哪款真的有效？",
    "化妆刷入门推荐｜这几把就够了", "换季护肤攻略｜换季不烂脸",
    "修容教程｜圆脸秒变小V脸", "腮红涂法大全｜不同脸型怎么涂",
    "底妆技巧｜告别假面感", "睫毛膏测评｜浓密纤长卷翘全搞定",
]

FITNESS_TITLES = [
    "居家健身｜每天30分钟练出马甲线", "帕梅拉一周跟练计划｜真的会瘦",
    "跑步新手入门｜从0到5公里", "减脂期怎么吃？热量计算公式分享",
    "瑜伽入门｜零基础也能做的10个体式", "增肌饮食指南｜蛋白质怎么补充",
    "上班族拉伸操｜5分钟缓解久坐酸痛", "健身房器械使用指南｜新手必看",
    "一个月瘦10斤的真实记录", "翘臀训练计划｜在家就能练",
    "体态矫正｜驼背圆肩这样改", "减脂 vs 减重｜90%的人都搞错了",
    "晨跑 vs 夜跑｜哪个更适合你", "HIIT训练合集｜燃脂效率翻倍",
    "蛋白粉怎么选？品牌对比测评", "拉伸大全｜运动前后的正确姿势",
]

FOOD_TAGS = ["美食分享", "食谱", "减脂餐", "早餐", "探店", "家常菜", "烘焙", "减肥餐", "火锅", "咖啡"]
FASHION_TAGS = ["穿搭", "OOTD", "显瘦", "平价穿搭", "韩系", "日系", "通勤穿搭", "基础款", "搭配", "秋冬穿搭"]
TECH_TAGS = ["数码", "科技", "好物推荐", "效率工具", "AI", "iPad", "手机", "智能家居", "App推荐", "测评"]
TRAVEL_TAGS = ["旅行攻略", "自由行", "旅拍", "打卡", "周末游", "自驾游", "露营", "海岛", "小众旅行", "省钱攻略"]
BEAUTY_TAGS = ["护肤", "化妆教程", "口红", "防晒", "敏感肌", "美白", "平价好物", "底妆", "眼影", "测评"]
FITNESS_TAGS = ["健身", "减脂", "瑜伽", "跑步", "居家健身", "马甲线", "增肌", "体态矫正", "减肥", "拉伸"]

LIFESTYLE_TITLES = [
    "独居女生的一天｜治愈的周末vlog", "租房改造｜500元打造ins风小窝",
    "提升幸福感的10个生活小习惯", "极简生活｜断舍离后我的变化",
    "一人居的仪式感｜早起routine", "大学生省钱攻略｜月花1500够吗",
    "搬家整理术｜行李箱收纳技巧", "社恐女孩的独处日常",
    "30天早起挑战｜我的生活完全变了", "下班后的3小时怎么过？",
    "好物分享｜提升生活品质的小东西", "时间管理｜普通人也能高效一天",
    "一个人也要好好吃饭｜独居日记", "周末宅家计划｜充实又放松",
    "毕业后独居第一年｜真实感受", "生活好物｜用了就回不去的小家电",
]

HOME_TITLES = [
    "小户型收纳｜40㎡也能住出100㎡感觉", "客厅改造｜花3000块焕然一新",
    "宜家好物推荐｜这些百元单品太绝了", "ins风卧室布置｜租房也能很好看",
    "厨房收纳大法｜台面永远干净整洁", "家居好物合集｜提升幸福感的20件",
    "全屋灯光设计｜氛围感拉满", "卫生间改造前后对比｜差距太大了",
    "极简风装修｜我家的装修花费清单", "阳台改造｜打造城市小花园",
    "书桌布置分享｜学习效率翻倍", "家居香薰推荐｜让房间自带高级感",
    "二手家具改造DIY｜省钱又好看", "智能家居入门｜全屋智能花了多少",
    "出租屋改造｜不伤墙的装饰方法", "日式收纳术｜跟日本主妇学整理",
]

LIFESTYLE_TAGS = ["生活方式", "独居日常", "vlog", "日常分享", "自律", "提升自己", "省钱", "时间管理", "生活记录", "治愈"]
HOME_TAGS = ["家居", "收纳", "装修", "改造", "好物推荐", "小户型", "租房改造", "宜家", "家居好物", "家居灵感"]


def generate_notes(category, titles, tags_pool, count=500):
    """为指定垂类生成模拟笔记数据"""
    notes = []
    for _ in range(count):
        title = random.choice(titles)
        title_var = title
        if random.random() > 0.5:
            suffixes = ["", "！", "✨", "🔥", "｜建议收藏", "‼️"]
            title_var = title + random.choice(suffixes)

        num_tags = random.randint(2, 8)
        selected_tags = random.sample(tags_pool, min(num_tags, len(tags_pool)))

        is_viral = random.random() < 0.15
        if is_viral:
            likes = random.randint(500, 50000)
            collects = random.randint(200, 20000)
            comments = random.randint(50, 5000)
        else:
            likes = random.randint(0, 500)
            collects = random.randint(0, 200)
            comments = random.randint(0, 50)

        notes.append((
            category,
            title_var,
            len(title_var),
            f"这是一篇关于{category}的笔记正文内容，包含详细的分享...",
            json.dumps(selected_tags, ensure_ascii=False),
            random.randint(6, 23),
            likes,
            collects,
            comments,
            random.choice([500, 1000, 5000, 10000, 50000, 100000]),
            1 if is_viral else 0,
            1 if random.random() > 0.4 else 0,
            round(random.uniform(0.05, 0.4), 2),
            round(random.uniform(0.3, 0.9), 2),
        ))
    return notes


def seed():
    """写入种子数据"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM notes")

    all_notes = []
    all_notes.extend(generate_notes("food", FOOD_TITLES, FOOD_TAGS, 500))
    all_notes.extend(generate_notes("fashion", FASHION_TITLES, FASHION_TAGS, 500))
    all_notes.extend(generate_notes("tech", TECH_TITLES, TECH_TAGS, 500))
    all_notes.extend(generate_notes("travel", TRAVEL_TITLES, TRAVEL_TAGS, 500))
    all_notes.extend(generate_notes("beauty", BEAUTY_TITLES, BEAUTY_TAGS, 500))
    all_notes.extend(generate_notes("fitness", FITNESS_TITLES, FITNESS_TAGS, 500))
    all_notes.extend(generate_notes("lifestyle", LIFESTYLE_TITLES, LIFESTYLE_TAGS, 500))
    all_notes.extend(generate_notes("home", HOME_TITLES, HOME_TAGS, 500))

    cursor.executemany("""
        INSERT INTO notes (
            category, title, title_length, content, tags,
            publish_hour, likes, collects, comments, followers,
            is_viral, cover_has_face, cover_text_ratio, cover_saturation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, all_notes)

    conn.commit()
    print(f"已插入 {len(all_notes)} 条种子数据")
    conn.close()


if __name__ == "__main__":
    seed()
