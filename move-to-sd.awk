!/extensions-inprogress/ && !/\.awk/ && !/TODO/ && !/\.gitignore/ && !/\.sh/ && !/\.sublime/ {
    gsub(/\//, "\\", $2)
    if ($1 == "M") {
        print "sd edit " $2;
        print "xcopy C:\\my\\dev\\" $2 " " $2;
    } else if ($1 == "A") {
        print "xcopy C:\\my\\dev\\" $2 " " $2;
        print "sd add " $2;
    } else if ($1 == "D") {
        print "sd delete " $2;
    }
}