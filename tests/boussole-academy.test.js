import { strict as assert } from "node:assert";
import {
  ACADEMY_COURSES,
  ACADEMY_COURSE_COUNT,
  createEmptyAcademyProgress,
  normalizeAcademyProgress,
  isAcademyCourseCompleted,
  getAcademyScopeKey,
  searchAcademyCourses,
} from "../js/academy.js";

assert.equal(ACADEMY_COURSE_COUNT,10);
assert.equal(ACADEMY_COURSES.length,10);
assert.ok(searchAcademyCourses("inventaire").some(course=>course.id==="stock"));
assert.ok(searchAcademyCourses("المخزون").some(course=>course.id==="stock"));
assert.ok(searchAcademyCourses("rapprochement bancaire").some(course=>course.id==="treasury"));
assert.equal(searchAcademyCourses("requête-inexistante").length,0);
assert.equal(searchAcademyCourses("").length,10);
const ids=new Set();
for(const course of ACADEMY_COURSES){
  assert.ok(course.id && !ids.has(course.id), "identifiant de parcours unique");
  ids.add(course.id);
  assert.equal(course.title.length,2);
  assert.equal(course.description.length,2);
  assert.equal(course.lessons.length,3);
  assert.equal(course.quiz.length,2);
  for(const lesson of course.lessons){
    assert.equal(lesson.length,4);
    assert.ok(lesson.every(value=>typeof value==="string"&&value.length>10));
  }
  for(const question of course.quiz){
    assert.equal(question.length,5);
    assert.equal(question[2].length,3);
    assert.ok(question[3]>=0&&question[3]<question[2].length);
    assert.equal(question[0].length>0,true);
    assert.equal(question[1].length>0,true);
  }
}
const empty=createEmptyAcademyProgress();
assert.deepEqual(empty,{version:1,courses:{}});
const course=ACADEMY_COURSES[0];
const complete={version:1,courses:{[course.id]:{completedLessons:["0","1","2","99","0"],quizScore:2,completedAt:"2026-11-27T00:00:00.000Z"},unknown:{completedLessons:["0"],quizScore:99}}};
const normalized=normalizeAcademyProgress(complete);
assert.deepEqual(normalized.courses[course.id].completedLessons,["0","1","2"]);
assert.equal(normalized.courses[course.id].quizScore,2);
assert.equal(normalized.courses.unknown,undefined);
assert.equal(isAcademyCourseCompleted(course,normalized.courses[course.id]),true);
assert.equal(isAcademyCourseCompleted(course,{completedLessons:["0","1"],quizScore:2}),false);
assert.equal(isAcademyCourseCompleted(course,{completedLessons:["0","1","2"],quizScore:1}),false);
assert.equal(normalizeAcademyProgress({version:9,courses:{}}).courses instanceof Object,true);
assert.notEqual(getAcademyScopeKey("user-a","company-a"),getAcademyScopeKey("user-b","company-a"));
assert.notEqual(getAcademyScopeKey("user-a","company-a"),getAcademyScopeKey("user-a","company-b"));
assert.notEqual(getAcademyScopeKey(null,null),getAcademyScopeKey("user-a",null));
console.log("Académie MIZANE : 10 parcours bilingues, leçons, évaluations, progression et cloisonnement local vérifiés.");
